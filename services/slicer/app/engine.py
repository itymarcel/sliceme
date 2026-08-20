import copy
import io
import importlib
import json
import math
import os
import re
import struct
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from xml.sax.saxutils import escape
from types import SimpleNamespace

from .printer_presets import printer_preset_gcode

import logging
logger = logging.getLogger('api.slicer')


PROFILES_DIR = Path(__file__).resolve().parent.parent / "profiles"


class ModelCollection(list):
    """Collection interface consumed by the 3MF builder."""

    def all(self):
        return self


@dataclass(frozen=True)
class UploadedModel:
    file_id: str
    file_name: str
    data: bytes


@dataclass
class SliceJob:
    models: list[UploadedModel]
    config: dict = field(default_factory=dict)
    file_overrides: dict = field(default_factory=dict)
    range_overrides: dict = field(default_factory=dict)
    transforms: dict = field(default_factory=dict)
    custom_gcode_for_z: list = field(default_factory=list)
    start_positions: dict = field(default_factory=dict)
    id: str = "request"

    def __post_init__(self):
        self.stl_files = ModelCollection(self.models)
        for file_id, start_position in self.start_positions.items():
            overrides = self.file_overrides.setdefault(str(file_id), {})
            overrides["start_position"] = start_position


_UNSUPPORTED_RANGE_OVERRIDE_KEYS = {}


def _import_trimesh():
    # Keep the heavy mesh dependency out of startup and simple 3MF requests.
    return importlib.import_module('trimesh')


def _step_to_stl_bytes(step_bytes: bytes) -> bytes:
    # Load the 200+ MB OCCT library only when a STEP file actually requires it.
    # cadquery-ocp-novtk uses the OCP.* namespace (not OCC.Core.*)
    import tempfile
    from OCP.STEPControl import STEPControl_Reader
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.BRep import BRep_Builder
    from OCP.TopoDS import TopoDS_Compound
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.StlAPI import StlAPI_Writer

    with tempfile.TemporaryDirectory() as tmpdir:
        step_path = os.path.join(tmpdir, 'input.step')
        stl_path = os.path.join(tmpdir, 'output.stl')
        with open(step_path, 'wb') as f:
            f.write(step_bytes)

        reader = STEPControl_Reader()
        if reader.ReadFile(step_path) != IFSelect_RetDone:
            raise ValueError("Failed to read STEP file — invalid or corrupt data")
        reader.TransferRoots()
        n = reader.NbShapes()
        if n == 0:
            raise ValueError("STEP file contains no transferable shapes")

        if n == 1:
            shape = reader.Shape(1)
        else:
            builder = BRep_Builder()
            compound = TopoDS_Compound()
            builder.MakeCompound(compound)
            for i in range(1, n + 1):
                builder.Add(compound, reader.Shape(i))
            shape = compound

        mesh = BRepMesh_IncrementalMesh(shape, 0.1, False, 0.5)
        mesh.Perform()
        if not mesh.IsDone():
            raise RuntimeError("STEP tessellation failed")

        writer = StlAPI_Writer()
        if not writer.Write(shape, stl_path):
            raise RuntimeError("STL write failed after STEP conversion")

        # OCCT may write ASCII STL; re-export as binary via trimesh
        trimesh_mod = _import_trimesh()
        mesh = trimesh_mod.load(stl_path, file_type='stl', force='mesh')
        data = mesh.export(file_type='stl')
        return data if isinstance(data, bytes) else data.encode()


# ---------------------------------------------------------------------------- #
#                              CONFIG LOADING                                  #
# ---------------------------------------------------------------------------- #

def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into base, returning a new dict."""
    result = dict(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _orca_scalar(value):
    """Convert typed frontend values into the scalar format Orca config expects."""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return value


def _normalize_orca_value(value, template_value=None):
    """
    Coerce overrides to match the value shape used by Orca project config.

    Orca's JSON config stores almost everything as strings or arrays of strings.
    The frontend now sends typed numbers/booleans, so normalize those before
    embedding them in Metadata/project_settings.config.
    """
    if value is None:
        return None

    if isinstance(template_value, list):
        items = value if isinstance(value, list) else [value]
        return [_orca_scalar(item) for item in items]

    if isinstance(template_value, str):
        return _orca_scalar(value)

    if isinstance(value, list):
        return [_orca_scalar(item) for item in value]

    return _orca_scalar(value)


def _normalize_flat_overrides(overrides: dict, base: dict) -> dict:
    """Normalize flat config overrides against the flat project config template."""
    normalized = {}
    for key, value in overrides.items():
        normalized_value = _normalize_orca_value(value, base.get(key))
        if normalized_value is not None:
            normalized[key] = normalized_value
    return normalized


def _minimum_nozzle_diameter(value) -> float:
    values = value if isinstance(value, list) else [value]
    diameters = [float(item) for item in values]
    if not diameters or any(not math.isfinite(item) or item <= 0 for item in diameters):
        raise ValueError("Nozzle diameter must contain positive finite values")
    return min(diameters)


def _validate_export_layer_heights(session, project_config: dict) -> None:
    """Reject layer heights Orca cannot load for the effective nozzle diameter."""
    project_nozzle = project_config.get('nozzle_diameter')
    checks = [('Global', project_config.get('layer_height'), project_nozzle)]
    for file_id, bundle in (session.file_overrides or {}).items():
        process = bundle.get('process_config', {})
        machine = bundle.get('machine_config', {})
        if 'layer_height' in process:
            checks.append((f'Object {file_id}', process['layer_height'], machine.get('nozzle_diameter', project_nozzle)))
    for scope, raw_height, raw_nozzle in checks:
        if raw_height is None or raw_nozzle is None:
            continue
        try:
            height = float(raw_height)
            nozzle = _minimum_nozzle_diameter(raw_nozzle)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{scope} layer height and nozzle diameter must be finite numbers") from error
        if not math.isfinite(height) or height <= 0:
            raise ValueError(f"{scope} layer height must be a positive finite number")
        if height > nozzle:
            raise ValueError(f"{scope} layer height {height:g} mm cannot exceed nozzle diameter {nozzle:g} mm")


def validate_range_overrides(range_overrides: dict):
    """Raise ValueError when a range override contains options the slicer cannot handle safely."""
    if not range_overrides:
        return
    if not isinstance(range_overrides, dict):
        raise ValueError("range_overrides must be an object keyed by file ID")

    for file_id, ranges in range_overrides.items():
        if not isinstance(ranges, list):
            raise ValueError(f"range_overrides[{file_id}] must be a list")

        for idx, range_override in enumerate(ranges):
            if not isinstance(range_override, dict):
                raise ValueError(f"range_overrides[{file_id}][{idx}] must be an object")

            for config_key, blocked_keys in _UNSUPPORTED_RANGE_OVERRIDE_KEYS.items():
                overrides = range_override.get(config_key, {})
                if not isinstance(overrides, dict):
                    raise ValueError(
                        f"range_overrides[{file_id}][{idx}].{config_key} must be an object"
                    )

                for opt_key in overrides:
                    if opt_key in blocked_keys:
                        raise ValueError(
                            f"{config_key}.{opt_key} is not supported in range overrides. "
                            f"Set it in the session-level config instead."
                        )


def _transform_to_matrix(transform, z_lift: float = 0.0) -> list:
    """
    Convert a frontend transform to a 3MF 12-value matrix.
    Accepts either:
      - A 12-value list already in 3MF format
      - A dict with 'position' {x, y, z?} and 'rotation' {x, y, z} (radians, XYZ Euler)
    Returns [m00..m22, tx, ty, tz].
    Note: tx/ty are in the frontend's centered-bed coordinate system.
    Callers must add bed_center to tx/ty to get OrcaSlicer absolute coordinates.
    """
    if isinstance(transform, list) and len(transform) == 12:
        return list(transform)  # copy so caller can mutate safely

    if isinstance(transform, dict):
        pos = transform.get('position', {})
        rot = transform.get('rotation', {})
        tx = float(pos.get('x', 0.0))
        ty = float(pos.get('y', 0.0))
        tz = float(pos.get('z', z_lift))

        rx = float(rot.get('x', 0.0))
        ry = float(rot.get('y', 0.0))
        rz = float(rot.get('z', 0.0))

        cx, sx = math.cos(rx), math.sin(rx)
        cy, sy = math.cos(ry), math.sin(ry)
        cz, sz = math.cos(rz), math.sin(rz)

        # XYZ Euler → rotation matrix (row-major, matching 3MF)
        return [
            cz*cy,              cz*sy*sx - sz*cx,   cz*sy*cx + sz*sx,
            sz*cy,              sz*sy*sx + cz*cx,   sz*sy*cx - cz*sx,
            -sy,                cy*sx,              cy*cx,
            tx, ty, tz,
        ]

    return None


def _compute_bed_center(project_config: dict) -> tuple:
    """Return (center_x, center_y) in mm from printable_area in the flat project config."""
    printable_area = project_config.get('printable_area', [])
    xs, ys = [], []
    for pt in printable_area:
        try:
            x, y = str(pt).split('x')
            xs.append(float(x))
            ys.append(float(y))
        except (ValueError, AttributeError):
            pass
    if not xs or not ys:
        return 125.0, 105.0  # fallback
    return (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0


def _load_bucket_config(filename: str) -> dict:
    """Load a bucketed config template (machine/process/filament) and return its
    settings as a plain dict, stripping OrcaSlicer metadata keys.
    Also strips bed_exclude_area — it must come from project_settings.config, not
    session overrides, to avoid degenerate values being stored in session configs."""
    _METADATA_KEYS = {'type', 'name', 'from', 'instantiation', 'version', 'is_custom_defined', 'bed_exclude_area'}
    path = PROFILES_DIR / filename
    try:
        with open(path, 'r') as f:
            raw = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning(f"_load_bucket_config: could not load {filename}: {e}")
        return {}
    return {k: v for k, v in raw.items() if k not in _METADATA_KEYS}


def default_config() -> dict:
    """Return the single baseline config exposed to the standalone UI."""
    return {
        "machine_config": _load_bucket_config("fdm_machine_common.json"),
        "process_config": _load_bucket_config("fdm_process_common.json"),
        "filament_config": _load_bucket_config("fdm_filament_pla.json"),
    }


def _apply_spiral_mode_relations(config: dict) -> None:
    """Apply OrcaSlicer's required vase-mode constraints at the API boundary."""
    if str(config.get('spiral_mode', '0')).lower() not in {'1', 'true'}:
        return
    config.update({
        'spiral_mode': '1',
        'wall_loops': '1',
        'sparse_infill_density': '0%',
        'top_shell_layers': '0',
        'top_shell_thickness': '0',
        'enable_support': '0',
        'support_on_build_plate_only': '0',
        'enforce_support_layers': '0',
    })


def load_project_config(session) -> dict:
    """
    Load project_settings.config (the flat merged OrcaSlicer project config)
    and apply any top-level overrides from session.config.

    This is the same format OrcaSlicer embeds in its own 3MF exports, so using
    it produces identical slicing behaviour to the GUI — unlike --load-settings
    which uses a different (profile-based) code path.
    """
    path = PROFILES_DIR / 'project_settings.config'

    try:
        with open(path, 'r') as f:
            base = json.load(f)
    except FileNotFoundError:
        logger.warning(f"project_settings.config not found at {path}; using empty config")
        base = {}
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse project_settings.config: {e}")
        base = {}

    # session.config may be nested under machine_config/process_config/filament_config
    # but project_settings.config is a flat OrcaSlicer dict — flatten before merging
    raw = session.config or {}
    overrides = {}
    for bucket in ('machine_config', 'process_config', 'filament_config'):
        overrides.update(raw.get(bucket, {}))
    for k, v in raw.items():
        if k not in ('machine_config', 'process_config', 'filament_config'):
            overrides[k] = v

    # SliceMe's target-printer preset selects only the G-code snippets from the
    # corresponding bundled Orca machine profile. It intentionally does not
    # import profile dimensions, nozzle, speeds, temperatures, or firmware.
    preset_id = overrides.pop('sliceme_printer_preset', '')
    if preset_id:
        overrides.update(printer_preset_gcode(str(preset_id)))
    overrides = _normalize_flat_overrides(overrides, base)

    # Remove any non-4-point bed_exclude_area from overrides — the post-merge step
    # will supply the correct fallback value.
    bed_excl_override = overrides.get('bed_exclude_area', [])
    if isinstance(bed_excl_override, list) and len(bed_excl_override) != 4:
        overrides.pop('bed_exclude_area', None)

    result = _deep_merge(base, overrides)

    # Spiral/vase mode is a relational setting in OrcaSlicer. Enforce the same
    # companion values for non-browser callers and older cached frontends too.
    # Bottom layers intentionally remain user-controlled.
    _apply_spiral_mode_relations(result)

    # Multi-material mode (SEMM) must be off. Our setup is: 1 extruder, 1 filament,
    # multiple objects on the same bed. With SEMM=1 and 2+ objects, OrcaSlicer
    # expects an N×N flush_volumes_matrix (e.g. 4 elements for 2 filaments) but our
    # config only has ["0"], causing a segfault at StaticPrintConfig initialization.
    result['single_extruder_multi_material'] = '0'

    # A null/missing infill density causes OrcaSlicer to fall back to its own
    # built-in default (typically 15%), which is not what we want. Always default
    # to 0% so the session config is the sole source of truth.
    if not result.get('sparse_infill_density'):
        result['sparse_infill_density'] = '0%'

    # Slicer sessions should respect the explicit layer_height chosen in the UI.
    # Variable/adaptive layer height can make layer-height changes appear ignored,
    # so force it off for session-driven slicing.
    result['variable_layer_height'] = '0'

    # OrcaSlicer's generate_exclude_polygon has two code paths:
    #   - exactly 4 points → rounded rectangle (safe, init_model_from_poly succeeds)
    #   - any other count → raw polygon (crashes GLU tessellator if degenerate)
    # Crucially, even an EMPTY bed_exclude_area causes init_model_from_poly to return
    # false, leaving m_exclude_triangles uninitialized. With 2+ objects, OrcaSlicer
    # accesses m_exclude_triangles for plate management and segfaults.
    # Fix: always provide a valid 4-point rectangle. Use a tiny 1x1mm area far off
    # the printable bed so it has no practical effect on slicing.
    bed_excl = result.get('bed_exclude_area', [])
    if not isinstance(bed_excl, list) or len(bed_excl) != 4:
        result['bed_exclude_area'] = ["999x999", "1000x999", "1000x1000", "999x1000"]

    return result


# ---------------------------------------------------------------------------- #
#                              3MF BUILDER                                     #
# ---------------------------------------------------------------------------- #

_RELS_CONTENT = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>"""

_CONTENT_TYPES_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="application/octet-stream"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>"""


def _parse_binary_stl(stl_bytes: bytes) -> tuple:
    """
    Parse a binary STL file into (vertices, triangles).
    vertices: list of (x, y, z) float tuples
    triangles: list of (v1, v2, v3) index tuples (sequential, no deduplication)
    Raises ValueError for files that don't look like binary STL.
    """
    if len(stl_bytes) < 84:
        raise ValueError("STL file is too small to be a valid binary STL")

    triangle_count = struct.unpack_from('<I', stl_bytes, 80)[0]
    expected_size = 84 + triangle_count * 50
    if len(stl_bytes) != expected_size:
        raise ValueError(
            f"STL does not appear to be binary STL "
            f"(expected {expected_size} bytes for {triangle_count} triangles, "
            f"got {len(stl_bytes)} bytes). Please export as binary STL."
        )

    vertex_index = {}  # (x, y, z) → int index, for deduplication
    vertices = []
    triangles = []
    offset = 84

    for _ in range(triangle_count):
        # Layout: 12 bytes normal (ignored), 3 × 12 bytes vertices, 2 bytes attribute
        raw = [
            struct.unpack_from('<fff', stl_bytes, offset + 12),
            struct.unpack_from('<fff', stl_bytes, offset + 24),
            struct.unpack_from('<fff', stl_bytes, offset + 36),
        ]
        indices = []
        for v in raw:
            if v not in vertex_index:
                vertex_index[v] = len(vertices)
                vertices.append(v)
            indices.append(vertex_index[v])
        triangles.append(tuple(indices))
        offset += 50

    return vertices, triangles


def _build_3dmodel_xml(stl_bytes_list: list, per_object_transforms: list = None, bed_center: tuple = (0.0, 0.0)) -> str:
    """
    Build 3dmodel.model XML with fully inline mesh data (vertices + triangles).
    stl_bytes_list: list of raw binary STL bytes, one per object.
    per_object_transforms: optional list of 12-value 3MF transform arrays, one per object.
      Format: [m00, m01, m02, m10, m11, m12, m20, m21, m22, tx, ty, tz]
      If None or entry is None, falls back to identity + Z-lift at bed center.
    bed_center: (cx, cy) — absolute bed center in mm (OrcaSlicer coordinate origin).
      Frontend sends position relative to bed center; we add bed_center to get
      absolute OrcaSlicer coordinates.
    OrcaSlicer will reject geometry that is below the build plate, so when no
    transform is provided we auto-lift using the mesh's minimum Z.
    """
    parsed = [_parse_binary_stl(b) for b in stl_bytes_list]

    objects_xml = []
    items_xml = []

    for idx, (vertices, triangles) in enumerate(parsed):
        obj_id = idx + 1

        xs = [v[0] for v in vertices]
        ys = [v[1] for v in vertices]
        zs = [v[2] for v in vertices]
        mesh_cx = (min(xs) + max(xs)) / 2
        mesh_cy = (min(ys) + max(ys)) / 2
        mesh_cz = (min(zs) + max(zs)) / 2

        raw_transform = per_object_transforms[idx] if per_object_transforms and idx < len(per_object_transforms) else None
        bx, by = bed_center

        if isinstance(raw_transform, dict):
            pos = raw_transform.get('position', {})
            rot = raw_transform.get('rotation', {})
            scale = raw_transform.get('scale', {})

            desired_x = float(pos.get('x', 0.0))
            desired_y = float(pos.get('y', 0.0))
            user_z    = float(pos.get('z', 0.0))
            sx_scale = float(scale.get('x', 1.0))
            sy_scale = float(scale.get('y', 1.0))
            sz_scale = float(scale.get('z', 1.0))
            if any(not math.isfinite(value) or value == 0 for value in (sx_scale, sy_scale, sz_scale)):
                raise ValueError("Object scale must contain finite non-zero values")

            # Frontend is Three.js (Y-up). OrcaSlicer is Z-up.
            # rx negated: Three.js rx=+90° inverts OrcaSlicer Z (world_z=-vy). rx=-90° gives world_z=+vy ✓
            # rz negated: Three.js and OrcaSlicer Z-rotation go in opposite directions.
            rx = -math.radians(float(rot.get('x', 0.0)))
            ry =  math.radians(float(rot.get('y', 0.0)))
            rz = -math.radians(float(rot.get('z', 0.0)))
            cx_r, sx_r = math.cos(rx), math.sin(rx)
            cy_r, sy_r = math.cos(ry), math.sin(ry)
            cz_r, sz_r = math.cos(rz), math.sin(rz)
            m00 = (cz_r*cy_r) * sx_scale;  m01 = (cz_r*sy_r*sx_r - sz_r*cx_r) * sx_scale;  m02 = (cz_r*sy_r*cx_r + sz_r*sx_r) * sx_scale
            m10 = (sz_r*cy_r) * sy_scale;  m11 = (sz_r*sy_r*sx_r + cz_r*cx_r) * sy_scale;  m12 = (sz_r*sy_r*cx_r - cz_r*sx_r) * sy_scale
            m20 = (-sy_r) * sz_scale;      m21 = (cy_r*sx_r) * sz_scale;                    m22 = (cy_r*cx_r) * sz_scale

            tx = desired_x - (m00*mesh_cx + m10*mesh_cy + m20*mesh_cz)
            ty = desired_y - (m01*mesh_cx + m11*mesh_cy + m21*mesh_cz)
            min_wz = min(m02*v[0] + m12*v[1] + m22*v[2] for v in vertices)
            tz = user_z - min_wz

            logger.info(
                f"_build_3dmodel_xml: obj={obj_id} "
                f"pos_frontend=({pos.get('x')},{pos.get('y')}) "
                f"rot_deg=({rot.get('x')},{rot.get('y')},{rot.get('z')}) "
                f"mesh_centroid=({mesh_cx:.2f},{mesh_cy:.2f},{mesh_cz:.2f}) "
                f"desired_bed=({desired_x:.2f},{desired_y:.2f}) "
                f"translation=({tx:.3f},{ty:.3f},{tz:.3f})"
            )

        elif isinstance(raw_transform, list) and len(raw_transform) == 12:
            m00, m01, m02, m10, m11, m12, m20, m21, m22, tx, ty, tz = raw_transform

        else:
            # No transform: identity rotation, center on bed, lift to z=0
            m00, m01, m02 = 1.0, 0.0, 0.0
            m10, m11, m12 = 0.0, 1.0, 0.0
            m20, m21, m22 = 0.0, 0.0, 1.0
            tx = bx - mesh_cx
            ty = by - mesh_cy
            tz = -min(zs)

        verts_xml = '\n'.join(
            f'          <vertex x="{v[0]:.6f}" y="{v[1]:.6f}" z="{v[2]:.6f}"/>'
            for v in vertices
        )

        tris_xml = '\n'.join(
            f'          <triangle v1="{t[0]}" v2="{t[1]}" v3="{t[2]}"/>'
            for t in triangles
        )

        objects_xml.append(
            f'    <object id="{obj_id}" type="model">\n'
            f'      <mesh>\n'
            f'        <vertices>\n'
            f'{verts_xml}\n'
            f'        </vertices>\n'
            f'        <triangles>\n'
            f'{tris_xml}\n'
            f'        </triangles>\n'
            f'      </mesh>\n'
            f'    </object>'
        )
        # 3MF item transform (column-major): m00 m01 m02 m10 m11 m12 m20 m21 m22 tx ty tz
        # world = R * local + t, where R columns are (m00,m01,m02), (m10,m11,m12), (m20,m21,m22)
        transform_str = (
            f"{m00:.6f} {m01:.6f} {m02:.6f} "
            f"{m10:.6f} {m11:.6f} {m12:.6f} "
            f"{m20:.6f} {m21:.6f} {m22:.6f} "
            f"{tx:.6f} {ty:.6f} {tz:.6f}"
        )
        # p:UUID is required for OrcaSlicer to recognize this as a native project and
        # respect item transforms instead of auto-arranging
        uuid_str = f"00000000-0000-0000-0000-{obj_id:012d}"
        item_str = (
            f'    <item objectid="{obj_id}" p:UUID="{uuid_str}" '
            f'transform="{transform_str}" printable="1"/>'
        )
        items_xml.append(item_str)

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US"\n'
        '  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"\n'
        '  xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"\n'
        '  xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"\n'
        '  requiredextensions="p">\n'
        # Orca/Bambu only imports custom_gcode_per_layer.xml when the 3MF looks
        # like a native project with a recognized generator version. A plain
        # "OrcaSlicer" application string is treated as third-party and the
        # custom-per-layer file is skipped.
        '  <metadata name="Application">BambuStudio-2.0.0.0</metadata>\n'
        '  <metadata name="BambuStudio:3mfVersion">1</metadata>\n'
        + '  <resources>\n'
        + '\n'.join(objects_xml) + '\n'
        + '  </resources>\n'
        '  <build>\n'
        + '\n'.join(items_xml) + '\n'
        '  </build>\n'
        '</model>'
    )


def _build_range_overrides_xml(session, stl_files) -> str:
    """
    Build layer_config_ranges.xml from session.range_overrides.

    OrcaSlicer format: root is <objects>, options use text content (not value= attribute).
    Object IDs match the 1-based indices used in 3dmodel.model.
    Returns None if there are no overrides.
    """
    file_id_to_idx = {str(f.file_id): idx + 1 for idx, f in enumerate(stl_files)}
    range_overrides = session.range_overrides or {}

    objects_xml = []
    for file_id_str, ranges in range_overrides.items():
        obj_id = file_id_to_idx.get(file_id_str)
        if obj_id is None:
            logger.warning(f"_build_range_overrides_xml: file_id {file_id_str!r} not in session STL files {list(file_id_to_idx.keys())}, skipping")
            continue
        ranges_xml = []
        for r in ranges:
            rng = r.get('range', {})
            min_z = float(rng.get('min_z', 0.0))
            max_z = float(rng.get('max_z', 0.0))
            options = []
            for config_key in ('process_config', 'machine_config', 'filament_config'):
                for opt_key, opt_val in r.get(config_key, {}).items():
                    if config_key == 'process_config' and opt_key == 'bw_vase_mode':
                        continue
                    normalized_val = _normalize_orca_value(opt_val)
                    if normalized_val is None:
                        continue
                    options.append(f'   <option opt_key="{opt_key}">{normalized_val}</option>')
            if not options:
                logger.info(f"_build_range_overrides_xml: skipping empty range min_z={min_z} max_z={max_z} for file {file_id_str}")
                continue
            ranges_xml.append(
                f'  <range min_z="{min_z}" max_z="{max_z}">\n'
                + '\n'.join(options) + '\n'
                + '  </range>'
            )
        if not ranges_xml:
            continue
        objects_xml.append(
            f' <object id="{obj_id}">\n'
            + '\n'.join(ranges_xml) + '\n'
            + ' </object>'
        )

    if not objects_xml:
        return None

    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<objects>\n'
        + '\n'.join(objects_xml) + '\n'
        + '</objects>'
    )


def _normalize_start_position(start_position):
    if not isinstance(start_position, dict):
        return None

    enabled = start_position.get('enabled', True)
    if not _is_truthy_override(enabled):
        return None

    x = start_position.get('x', start_position.get('model_start_point_x'))
    y = start_position.get('y', start_position.get('model_start_point_y'))
    if x is None or y is None:
        return None

    return {
        'x': _orca_scalar(x),
        'y': _orca_scalar(y),
    }


def _build_model_settings_xml(session, stl_files) -> str:
    """
    Build Metadata/model_settings.config in OrcaSlicer native format.
    Every object must be listed so OrcaSlicer assigns extruders correctly.
    Per-object settings from session.file_overrides are added as metadata on the part.
    """
    file_overrides = session.file_overrides or {}
    start_positions = getattr(session, 'start_positions', None) or {}

    objects_xml = []
    for idx, f in enumerate(stl_files):
        obj_id = idx + 1
        name = f"object{obj_id}"
        overrides = file_overrides.get(str(f.file_id), {})
        start_position = _normalize_start_position(start_positions.get(str(f.file_id)))

        object_settings_meta = []
        for opt_key, opt_val in overrides.get('process_config', {}).items():
            normalized_val = _normalize_orca_value(opt_val)
            if normalized_val is None:
                continue
            object_settings_meta.append(
                f'    <metadata key="{escape(str(opt_key))}" value="{escape(str(normalized_val))}"/>'
            )

        part_settings_meta = []
        for config_key in ('machine_config', 'filament_config'):
            for opt_key, opt_val in overrides.get(config_key, {}).items():
                normalized_val = _normalize_orca_value(opt_val)
                if normalized_val is None:
                    continue
                part_settings_meta.append(
                    f'      <metadata key="{escape(str(opt_key))}" value="{escape(str(normalized_val))}"/>'
                )

        part_lines = [
            f'    <part id="{obj_id}" subtype="normal_part">',
            f'      <metadata key="name" value="{name}"/>',
            f'      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>',
        ]
        if start_position:
            part_lines.extend([
                '      <metadata key="model_start_point_enabled" value="1"/>',
                f'      <metadata key="model_start_point_x" value="{escape(str(start_position["x"]))}"/>',
                f'      <metadata key="model_start_point_y" value="{escape(str(start_position["y"]))}"/>',
            ])
        part_lines.extend(part_settings_meta)
        part_lines.append('    </part>')

        objects_xml.append(
            f'  <object id="{obj_id}">\n'
            f'    <metadata key="name" value="{name}"/>\n'
            f'    <metadata key="extruder" value="1"/>\n'
            + ('\n'.join(object_settings_meta) + '\n' if object_settings_meta else '')
            + '\n'.join(part_lines) + '\n'
            + '  </object>'
        )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        + '\n'.join(objects_xml) + '\n'
        '</config>'
    )


def _build_custom_gcode_per_layer_xml(session) -> str:
    """
    Build Metadata/custom_gcode_per_layer.xml in native OrcaSlicer format.

    Expected session.custom_gcode_for_z shape:
    [
      {
        "top_z": 7.7,
        "type": 4,
        "extruder": "1",
        "color": "",
        "extra": "M104 S230",
        "gcode": "M104 S230"
      }
    ]
    """
    events = session.custom_gcode_for_z or []
    if not isinstance(events, list) or not events:
        return None

    layer_lines = []
    for event in events:
        if not isinstance(event, dict):
            continue

        top_z = event.get('top_z')
        gcode = event.get('gcode')
        if top_z is None or gcode in (None, ''):
            continue

        layer_type = event.get('type', 4)
        extruder = event.get('extruder', '1')
        color = event.get('color', '')
        extra = event.get('extra', gcode)

        layer_lines.append(
            f'<layer top_z="{escape(str(top_z))}" '
            f'type="{escape(str(layer_type))}" '
            f'extruder="{escape(str(extruder))}" '
            f'color="{escape(str(color))}" '
            f'extra="{escape(str(extra))}" '
            f'gcode="{escape(str(gcode))}"/>'
        )

    if not layer_lines:
        return None

    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<custom_gcodes_per_layer>\n'
        '<plate>\n'
        '<plate_info id="1"/>\n'
        + '\n'.join(layer_lines) + '\n'
        '<mode value="MultiAsSingle"/>\n'
        '</plate>\n'
        '</custom_gcodes_per_layer>'
    )


def _ensure_binary_stl(raw: bytes) -> bytes:
    """Return raw if it is already valid binary STL; otherwise convert via trimesh."""
    if len(raw) >= 84:
        triangle_count = struct.unpack_from('<I', raw, 80)[0]
        if len(raw) == 84 + triangle_count * 50:
            return raw  # already valid binary STL
    trimesh_mod = _import_trimesh()
    mesh = trimesh_mod.load(io.BytesIO(raw), file_type='stl', force='mesh')
    data = mesh.export(file_type='stl')
    return data if isinstance(data, bytes) else data.encode()


def _download_stl_bytes(file_model) -> bytes:
    raw = file_model.data
    ext = (file_model.file_name or '').rsplit('.', 1)[-1].lower()
    if ext in ('step', 'stp'):
        logger.info(f"_download_stl_bytes: converting STEP file {file_model.file_id} to STL")
        raw = _step_to_stl_bytes(raw)
    elif ext == 'stl':
        original_size = len(raw)
        raw = _ensure_binary_stl(raw)
        if len(raw) != original_size:
            logger.info(f"_download_stl_bytes: converted ASCII STL {file_model.file_id} to binary ({original_size} → {len(raw)} bytes)")
    return raw


def _export_binary_stl(mesh) -> bytes:
    data = mesh.export(file_type='stl')
    if isinstance(data, str):
        return data.encode('utf-8')
    return data


def _write_debug_stl(name: str, mesh) -> None:
    if os.environ.get("SLICER_DEBUG_ARTIFACTS") != "1":
        return
    debug_path = Path(tempfile.gettempdir()) / name
    debug_path.write_bytes(_export_binary_stl(mesh))


def _write_debug_bytes(name: str, data: bytes) -> None:
    if os.environ.get("SLICER_DEBUG_ARTIFACTS") != "1":
        return
    debug_path = Path(tempfile.gettempdir()) / name
    debug_path.write_bytes(data)


def _build_affine_from_item_transform(raw_transform, vertices: list, bed_center: tuple) -> list:
    xs = [v[0] for v in vertices]
    ys = [v[1] for v in vertices]
    zs = [v[2] for v in vertices]
    mesh_cx = (min(xs) + max(xs)) / 2
    mesh_cy = (min(ys) + max(ys)) / 2
    mesh_cz = (min(zs) + max(zs)) / 2
    bx, by = bed_center

    if isinstance(raw_transform, dict):
        pos = raw_transform.get('position', {})
        rot = raw_transform.get('rotation', {})
        scale = raw_transform.get('scale', {})

        desired_x = float(pos.get('x', 0.0))
        desired_y = float(pos.get('y', 0.0))
        user_z = float(pos.get('z', 0.0))
        sx_scale = float(scale.get('x', 1.0))
        sy_scale = float(scale.get('y', 1.0))
        sz_scale = float(scale.get('z', 1.0))

        rx = -math.radians(float(rot.get('x', 0.0)))
        ry = math.radians(float(rot.get('y', 0.0)))
        rz = -math.radians(float(rot.get('z', 0.0)))
        cx_r, sx_r = math.cos(rx), math.sin(rx)
        cy_r, sy_r = math.cos(ry), math.sin(ry)
        cz_r, sz_r = math.cos(rz), math.sin(rz)

        m00 = (cz_r * cy_r) * sx_scale
        m01 = (cz_r * sy_r * sx_r - sz_r * cx_r) * sx_scale
        m02 = (cz_r * sy_r * cx_r + sz_r * sx_r) * sx_scale
        m10 = (sz_r * cy_r) * sy_scale
        m11 = (sz_r * sy_r * sx_r + cz_r * cx_r) * sy_scale
        m12 = (sz_r * sy_r * cx_r - cz_r * sx_r) * sy_scale
        m20 = (-sy_r) * sz_scale
        m21 = (cy_r * sx_r) * sz_scale
        m22 = (cy_r * cx_r) * sz_scale

        tx = desired_x - (m00 * mesh_cx + m10 * mesh_cy + m20 * mesh_cz)
        ty = desired_y - (m01 * mesh_cx + m11 * mesh_cy + m21 * mesh_cz)
        min_wz = min(m02 * v[0] + m12 * v[1] + m22 * v[2] for v in vertices)
        tz = user_z - min_wz
        return [m00, m01, m02, m10, m11, m12, m20, m21, m22, tx, ty, tz]

    if isinstance(raw_transform, list) and len(raw_transform) == 12:
        return list(raw_transform)

    min_z = min(zs)
    return [
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 0.0, 1.0,
        bx - mesh_cx, by - mesh_cy, -min_z,
    ]


def _apply_print_transform_to_mesh(mesh, raw_transform, bed_center: tuple):
    stl_bytes = _export_binary_stl(mesh)
    vertices, _ = _parse_binary_stl(stl_bytes)
    m00, m01, m02, m10, m11, m12, m20, m21, m22, tx, ty, tz = _build_affine_from_item_transform(
        raw_transform,
        vertices,
        bed_center,
    )
    matrix = [
        [m00, m10, m20, tx],
        [m01, m11, m21, ty],
        [m02, m12, m22, tz],
        [0.0, 0.0, 0.0, 1.0],
    ]
    transformed = mesh.copy()
    transformed.apply_transform(matrix)
    return transformed


def _flatten_bucket_overrides(raw: dict) -> dict:
    flat = {}
    for bucket in ('machine_config', 'process_config', 'filament_config'):
        flat.update(raw.get(bucket, {}))
    for key, value in raw.items():
        if key not in ('machine_config', 'process_config', 'filament_config'):
            flat[key] = value
    flat.pop('sliceme_printer_preset', None)
    return flat


def _load_project_config_for_file(session, file_model) -> dict:
    project_config = load_project_config(session)
    file_override = (session.file_overrides or {}).get(str(file_model.file_id), {})
    flat_file_override = _flatten_bucket_overrides(file_override)
    normalized = _normalize_flat_overrides(flat_file_override, project_config)
    return _deep_merge(project_config, normalized)


def _get_explicit_file_override_keys(session, file_model) -> set:
    file_override = (session.file_overrides or {}).get(str(file_model.file_id), {})
    explicit = set()
    for bucket in ('machine_config', 'process_config', 'filament_config'):
        explicit.update(file_override.get(bucket, {}).keys())
    return explicit


def _set_default_if_not_explicit(project_config: dict, explicit_keys: set, key: str, value):
    if key not in explicit_keys:
        project_config[key] = value


def _get_print_heights(project_config: dict) -> tuple:
    first_layer_height = float(project_config.get('initial_layer_print_height', 0.2))
    layer_height = float(project_config.get('layer_height', 0.3))
    return first_layer_height, layer_height


def _snap_z_to_layer_boundary(requested_z: float, project_config: dict, max_z: float) -> float:
    first_layer_height, layer_height = _get_print_heights(project_config)
    if max_z <= 0:
        raise ValueError("Model height must be greater than 0 for spiral split planning.")

    boundaries = []
    current = first_layer_height
    epsilon = 1e-6
    while current <= max_z + epsilon:
        boundaries.append(round(min(current, max_z), 6))
        current += layer_height

    if not boundaries:
        boundaries = [round(max_z, 6)]

    return min(boundaries, key=lambda value: abs(value - requested_z))


def _normalize_spiral_mode(value) -> str:
    normalized = _orca_scalar(value)
    if str(normalized) not in {'0', '1'}:
        raise ValueError(f"Unsupported spiral_mode value {value!r}. Only 0/1 are supported.")
    return str(normalized)


def _is_truthy_override(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def _range_overrides_request_bw_vase_mode(range_overrides) -> bool:
    for ranges in (range_overrides or {}).values():
        if not isinstance(ranges, list):
            continue
        for range_override in ranges:
            process_overrides = (range_override or {}).get('process_config', {})
            if isinstance(process_overrides, dict) and _is_truthy_override(process_overrides.get('bw_vase_mode')):
                return True
    return False


def _iter_normalized_range_overrides(session, file_model, model_height: float):
    range_overrides = (session.range_overrides or {}).get(str(file_model.file_id), [])
    for idx, range_override in enumerate(range_overrides):
        if not isinstance(range_override, dict):
            raise ValueError(f"range_overrides[{file_model.file_id}][{idx}] must be an object")

        machine_overrides = range_override.get('machine_config', {})
        filament_overrides = range_override.get('filament_config', {})
        process_overrides = range_override.get('process_config', {})
        for bucket_name, overrides in (
            ('machine_config', machine_overrides),
            ('filament_config', filament_overrides),
            ('process_config', process_overrides),
        ):
            if not isinstance(overrides, dict):
                raise ValueError(
                    f"range_overrides[{file_model.file_id}][{idx}].{bucket_name} must be an object"
                )

        rng = range_override.get('range', {})
        min_z = max(0.0, float(rng.get('min_z', 0.0)))
        max_z = min(model_height, float(rng.get('max_z', model_height)))
        if max_z <= min_z:
            continue

        yield {
            'min_z': min_z,
            'max_z': max_z,
            'machine_config': machine_overrides,
            'filament_config': filament_overrides,
            'process_config': process_overrides,
        }


def _collect_segment_scene_overrides(session, file_model, probe_z: float, model_height: float, base_config: dict) -> dict:
    flat_overrides = {}
    for range_override in _iter_normalized_range_overrides(session, file_model, model_height):
        if not (range_override['min_z'] <= probe_z < range_override['max_z']):
            continue
        flat_overrides.update(range_override['machine_config'])
        flat_overrides.update(range_override['filament_config'])
        flat_overrides.update(range_override['process_config'])
    return _normalize_flat_overrides(flat_overrides, base_config)


def _collect_segment_explicit_keys(session, file_model, probe_z: float, model_height: float) -> set:
    explicit = set()
    for range_override in _iter_normalized_range_overrides(session, file_model, model_height):
        if not (range_override['min_z'] <= probe_z < range_override['max_z']):
            continue
        explicit.update(range_override['machine_config'].keys())
        explicit.update(range_override['filament_config'].keys())
        explicit.update(range_override['process_config'].keys())
    return explicit


def _extract_spiral_special_flow(session, file_model, model_height: float, project_config: dict):
    normalized_ranges = list(_iter_normalized_range_overrides(session, file_model, model_height))
    if not normalized_ranges:
        return None

    spiral_ranges = []
    has_spiral_override = False
    for range_override in normalized_ranges:
        process_overrides = range_override['process_config']
        if 'spiral_mode' not in process_overrides:
            continue

        has_spiral_override = True
        spiral_ranges.append(
            {
                'min_z': range_override['min_z'],
                'max_z': range_override['max_z'],
                'value': _normalize_spiral_mode(process_overrides['spiral_mode']),
            }
        )

    if not has_spiral_override:
        return None

    if session.custom_gcode_for_z:
        raise ValueError(
            "Spiral range slicing does not support custom_gcode_for_z yet."
        )

    spiral_ranges.sort(key=lambda item: (item['min_z'], item['max_z']))
    for prev, current in zip(spiral_ranges, spiral_ranges[1:]):
        if current['min_z'] < prev['max_z'] - 1e-6:
            raise ValueError("Overlapping spiral_mode range overrides are not supported.")

    default_spiral = _normalize_spiral_mode(project_config.get('spiral_mode', '0'))
    boundaries = {0.0, round(model_height, 6)}
    for item in spiral_ranges:
        boundaries.add(round(item['min_z'], 6))
        boundaries.add(round(item['max_z'], 6))
    boundaries = sorted(boundaries)

    segments = []
    for start, end in zip(boundaries, boundaries[1:]):
        if end <= start + 1e-6:
            continue
        midpoint = (start + end) / 2.0
        state = default_spiral
        for item in spiral_ranges:
            if item['min_z'] <= midpoint < item['max_z']:
                state = item['value']
        if segments and segments[-1]['state'] == state:
            segments[-1]['end'] = end
        else:
            segments.append({'start': start, 'end': end, 'state': state})

    if len(segments) != 2 or segments[0]['state'] != '0' or segments[1]['state'] != '1':
        raise ValueError(
            "Spiral range slicing currently supports exactly one effective transition from "
            "non-spiral base to spiral top on a single STL."
        )

    requested_handoff_z = float(segments[0]['end'])
    snapped_handoff_z = _snap_z_to_layer_boundary(requested_handoff_z, project_config, model_height)
    _, layer_height = _get_print_heights(project_config)
    if snapped_handoff_z <= 0 or snapped_handoff_z >= model_height:
        raise ValueError("Computed spiral handoff is outside the printable model height.")

    return {
        'requested_handoff_z': requested_handoff_z,
        'handoff_z': snapped_handoff_z,
        'lower_overlap_height': layer_height,
    }


def _extract_bw_vase_mode_flow(session, file_model, model_height: float, project_config: dict):
    normalized_ranges = list(_iter_normalized_range_overrides(session, file_model, model_height))
    vase_ranges = []
    for range_override in normalized_ranges:
        process_overrides = range_override['process_config']
        if not _is_truthy_override(process_overrides.get('bw_vase_mode')):
            continue
        vase_ranges.append(
            {
                'min_z': range_override['min_z'],
                'max_z': range_override['max_z'],
            }
        )

    if not vase_ranges:
        return None

    if len(vase_ranges) != 1:
        raise ValueError("bw_vase_mode currently supports exactly one vase range on a single STL.")

    vase_range = vase_ranges[0]
    if vase_range['min_z'] <= 0 or vase_range['min_z'] >= model_height:
        raise ValueError("bw_vase_mode range must start inside the printable model height.")

    snapped_handoff_z = _snap_z_to_layer_boundary(vase_range['min_z'], project_config, model_height)
    _, layer_height = _get_print_heights(project_config)
    if snapped_handoff_z <= 0 or snapped_handoff_z >= model_height:
        raise ValueError("Computed bw_vase_mode handoff is outside the printable model height.")

    return {
        'requested_handoff_z': float(vase_range['min_z']),
        'handoff_z': snapped_handoff_z,
        'lower_overlap_height': layer_height,
    }


def _split_mesh_with_lower_overlap(mesh, handoff_z: float, overlap_height: float):
    min_z = float(mesh.bounds[0][2])
    max_z = float(mesh.bounds[1][2])
    model_height = max_z - min_z
    if handoff_z <= 0 or handoff_z >= model_height:
        raise ValueError(
            f"Spiral handoff {handoff_z:.3f}mm is outside the model height {model_height:.3f}mm."
        )

    lower_cut_z = handoff_z
    upper_cut_z = handoff_z
    lower_plane_local_z = min_z + lower_cut_z
    upper_plane_local_z = min_z + upper_cut_z

    lower = mesh.slice_plane(
        plane_origin=[0.0, 0.0, lower_plane_local_z],
        plane_normal=[0.0, 0.0, -1.0],
        cap=True,
    )
    upper = mesh.slice_plane(
        plane_origin=[0.0, 0.0, upper_plane_local_z],
        plane_normal=[0.0, 0.0, 1.0],
        cap=False,
    )
    if lower is None or upper is None:
        raise ValueError("Failed to split the STL into lower and upper spiral segments.")

    return lower, upper, lower_cut_z, upper_cut_z


def _build_special_flow_3mf(mesh, project_config: dict) -> bytes:
    mesh_on_bed = mesh.copy()
    min_z = float(mesh_on_bed.bounds[0][2])
    mesh_on_bed.apply_translation([0.0, 0.0, -min_z])
    stl_bytes = _export_binary_stl(mesh_on_bed)
    identity_transform = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0]
    fake_session = SimpleNamespace(file_overrides={})
    fake_objects = [SimpleNamespace(file_id=1)]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('_rels/.rels', _RELS_CONTENT)
        zf.writestr('[Content_Types].xml', _CONTENT_TYPES_TEMPLATE)
        zf.writestr(
            '3D/3dmodel.model',
            _build_3dmodel_xml([stl_bytes], [identity_transform], bed_center=(0.0, 0.0)),
        )
        zf.writestr('Metadata/project_settings.config', json.dumps(project_config, indent=2))
        zf.writestr('Metadata/model_settings.config', _build_model_settings_xml(fake_session, fake_objects))
    return buf.getvalue()


def _find_body_start(lines):
    for idx, line in enumerate(lines):
        if line.strip() == ';BEFORE_LAYER_CHANGE':
            return idx
    for idx, line in enumerate(lines):
        if line.startswith(';AFTER_LAYER_CHANGE'):
            return idx
    raise ValueError("Could not find layer-change marker in G-code.")


def _find_executable_block_start(lines):
    for idx, line in enumerate(lines):
        if line.strip() == '; EXECUTABLE_BLOCK_START':
            return idx + 1
    raise ValueError("Could not find EXECUTABLE_BLOCK_START in G-code.")


def _find_footer_start(lines):
    for idx, line in enumerate(lines):
        if 'move print head up' in line.lower():
            return idx
    for idx, line in enumerate(lines):
        if line.startswith('M104 S0'):
            return idx
    return len(lines)


def _summarize_lines(lines, start: int, count: int = 6) -> str:
    lo = max(0, start)
    hi = min(len(lines), start + count)
    return "\n".join(f"{idx}: {lines[idx]}" for idx in range(lo, hi))


def _find_recent_z_moves(lines, limit: int = 12) -> str:
    matches = []
    for idx, line in enumerate(lines):
        if _Z_PARAM_RE.search(line):
            matches.append(f"{idx}: {line}")
    return "\n".join(matches[-limit:])


_GCODE_FLOAT_RE = r'-?(?:\d+(?:\.\d+)?|\.\d+)'
_Z_PARAM_RE = re.compile(rf'([Gg][0123]\s+.*?\bZ)({_GCODE_FLOAT_RE})')
_LAYER_Z_COMMENT_RE = re.compile(rf'^;Z:({_GCODE_FLOAT_RE})$')
_EXTRUSION_MOVE_Z_RE = re.compile(rf'^[Gg][01]\s+.*\bZ({_GCODE_FLOAT_RE})')
_EXTRUSION_PARAM_RE = re.compile(rf'\bE({_GCODE_FLOAT_RE})')
_EXTRUSION_REPLACE_RE = re.compile(rf'(\bE)({_GCODE_FLOAT_RE})')
_X_PARAM_RE = re.compile(rf'\bX({_GCODE_FLOAT_RE})')
_Y_PARAM_RE = re.compile(rf'\bY({_GCODE_FLOAT_RE})')


def _parse_axis_value(pattern, line: str) -> Optional[float]:
    match = pattern.search(line)
    return float(match.group(1)) if match else None


def _set_z_in_gcode_line(line: str, z_value: float) -> str:
    match = _Z_PARAM_RE.search(line)
    if match:
        return _shift_z_in_line(line, z_value - float(match.group(2)))
    if re.match(r'^[Gg][0123]\b', line):
        return f"{line} Z{z_value:.5f}"
    return line


def _scale_extrusion_in_gcode_line(line: str, scale: float) -> str:
    def repl(match):
        return f"{match.group(1)}{float(match.group(2)) * scale:.5f}"

    return _EXTRUSION_REPLACE_RE.sub(repl, line, count=1)


def _iter_layer_blocks(lines):
    layer_starts = [idx for idx, line in enumerate(lines) if line.startswith(';LAYER_CHANGE')]
    for pos, start in enumerate(layer_starts):
        end = layer_starts[pos + 1] if pos + 1 < len(layer_starts) else len(lines)
        block = lines[start:end]
        block_z = None
        for line in block:
            match = _LAYER_Z_COMMENT_RE.match(line.strip())
            if match:
                block_z = float(match.group(1))
                break
        yield {
            'start': start,
            'end': end,
            'z': block_z,
            'lines': block,
        }


def _rewrite_outer_wall_block_as_vase(
    block_lines,
    z_start: float,
    z_end: float,
    initial_type=None,
    fade_extrusion: bool = False,
):
    current_type = initial_type
    current_x = None
    current_y = None
    kept_lines = []
    wall_entries = []

    for idx, line in enumerate(block_lines):
        if line.startswith(';TYPE:'):
            current_type = line.strip()
            if current_type == ';TYPE:Outer wall':
                kept_lines.append(line)
            continue

        x_value = _parse_axis_value(_X_PARAM_RE, line)
        y_value = _parse_axis_value(_Y_PARAM_RE, line)
        next_x = current_x if x_value is None else x_value
        next_y = current_y if y_value is None else y_value

        if current_type == ';TYPE:Outer wall':
            e_match = _EXTRUSION_PARAM_RE.search(line)
            has_xy = x_value is not None or y_value is not None
            if e_match and float(e_match.group(1)) > 0 and has_xy and next_x is not None and next_y is not None:
                segment_length = 0.0
                if current_x is not None and current_y is not None:
                    segment_length = math.hypot(next_x - current_x, next_y - current_y)
                kept_lines.append(line)
                wall_entries.append({'idx': len(kept_lines) - 1, 'length': segment_length})

        current_x, current_y = next_x, next_y

    if not wall_entries:
        return list(block_lines), current_type

    total_length = sum(item['length'] for item in wall_entries)
    if total_length <= 0:
        total_length = float(len(wall_entries))
        for item in wall_entries:
            item['length'] = 1.0

    progress = 0.0
    z_delta = z_end - z_start
    for item in wall_entries:
        progress += item['length']
        fraction = min(max(progress / total_length, 0.0), 1.0)
        line = _set_z_in_gcode_line(
            kept_lines[item['idx']],
            z_start + (z_delta * fraction),
        )
        if fade_extrusion:
            line = _scale_extrusion_in_gcode_line(line, 0.02 + (0.98 * fraction))
        kept_lines[item['idx']] = line
    return kept_lines, current_type


def _convert_gcode_range_to_vase(gcode_text: str, start_z: float) -> str:
    lines = gcode_text.splitlines()
    blocks = list(_iter_layer_blocks(lines))
    if len(blocks) < 2:
        return gcode_text

    rewritten = []
    cursor = 0
    rewrites = 0
    current_type = None
    fade_extrusion = True
    for idx, block in enumerate(blocks):
        rewritten.extend(lines[cursor:block['start']])
        cursor = block['end']

        next_block = blocks[idx + 1] if idx + 1 < len(blocks) else None
        if block['z'] is not None and block['z'] < start_z - 1e-6:
            for line in block['lines']:
                if line.startswith(';TYPE:'):
                    current_type = line.strip()
            rewritten.extend(block['lines'])
            continue
        if block['z'] is None or next_block is None or next_block['z'] is None:
            rewritten.extend(block['lines'])
            continue
        if next_block['z'] <= block['z']:
            rewritten.extend(block['lines'])
            continue
        new_block_lines, current_type = _rewrite_outer_wall_block_as_vase(
            block['lines'],
            z_start=block['z'],
            z_end=next_block['z'],
            initial_type=current_type,
            fade_extrusion=fade_extrusion,
        )
        rewritten.extend(new_block_lines)
        if new_block_lines != block['lines']:
            rewrites += 1
            fade_extrusion = False

    rewritten.extend(lines[cursor:])

    logger.info(
        "convert_gcode_range_to_vase: start_z=%.5f rewrote %d layer(s)",
        start_z,
        rewrites,
    )
    return "\n".join(rewritten) + "\n"


def _shift_z_in_line(line: str, delta_z: float) -> str:
    def repl(match):
        prefix = match.group(1)
        value = float(match.group(2))
        return f"{prefix}{value + delta_z:.5f}"

    return _Z_PARAM_RE.sub(repl, line)


def _find_first_upper_print_z(lines) -> float:
    body_start = _find_body_start(lines)
    for line in lines[body_start:]:
        match = _LAYER_Z_COMMENT_RE.match(line.strip())
        if match:
            return float(match.group(1))
    raise ValueError("Could not determine first upper print Z from G-code comments.")


def _find_first_upper_extrusion_z(lines) -> float:
    body_start = _find_body_start(lines)
    current_z = None
    for line in lines[body_start:]:
        stripped = line.strip()
        z_match = _EXTRUSION_MOVE_Z_RE.match(stripped)
        if z_match:
            current_z = float(z_match.group(1))
        e_match = _EXTRUSION_PARAM_RE.search(stripped)
        if not e_match:
            continue
        if float(e_match.group(1)) <= 0:
            continue
        if current_z is not None:
            return current_z
    raise ValueError("Could not determine first upper extrusion Z from G-code moves.")


def _merge_spiral_gcode(lower_text: str, upper_text: str, handoff_z: float) -> bytes:
    lower_lines = lower_text.splitlines()
    upper_lines = upper_text.splitlines()

    lower_footer_start = _find_footer_start(lower_lines)
    lower_kept = lower_lines[:lower_footer_start]
    upper_body_start = _find_executable_block_start(upper_lines)
    first_upper_print_z = _find_first_upper_print_z(upper_lines)
    first_upper_extrusion_z = _find_first_upper_extrusion_z(upper_lines)
    z_shift = handoff_z - first_upper_extrusion_z
    logger.info(
        "merge_spiral_gcode: handoff_z=%.5f first_upper_comment_z=%.5f "
        "first_upper_extrusion_z=%.5f z_shift=%.5f",
        handoff_z,
        first_upper_print_z,
        first_upper_extrusion_z,
        z_shift,
    )
    logger.info(
        "merge_spiral_gcode: lower_total=%d lower_kept=%d lower_trimmed=%d upper_total=%d upper_trimmed=%d",
        len(lower_lines),
        len(lower_kept),
        len(lower_lines) - len(lower_kept),
        len(upper_lines),
        upper_body_start,
    )
    logger.info(
        "merge_spiral_gcode: lower_tail_before_trim:\n%s",
        _summarize_lines(lower_lines, lower_footer_start - 10, 16),
    )
    logger.info(
        "merge_spiral_gcode: lower_recent_z_moves:\n%s",
        _find_recent_z_moves(lower_kept, 20),
    )
    logger.info(
        "merge_spiral_gcode: upper_head_before_trim:\n%s",
        _summarize_lines(upper_lines, upper_body_start - 10, 20),
    )
    upper_kept = [_shift_z_in_line(line, z_shift) for line in upper_lines[upper_body_start:]]
    logger.info(
        "merge_spiral_gcode: upper_head_after_shift:\n%s",
        _summarize_lines(upper_kept, 0, 40),
    )

    merged = []
    merged.extend(lower_kept)
    merged.append('; MERGE_TRANSITION_BEGIN')
    merged.append(f'; UPPER_FIRST_PRINT_Z={first_upper_print_z:.5f}')
    merged.append(f'; UPPER_FIRST_EXTRUSION_Z={first_upper_extrusion_z:.5f}')
    merged.append(f'; UPPER_Z_SHIFT={z_shift:.5f}')
    merged.append('G92 E0')
    merged.append('; MERGE_TRANSITION_END')
    merged.extend(upper_kept)
    return ("\n".join(merged) + "\n").encode('utf-8')


def _maybe_slice_spiral_range_special_case(session) -> Optional[bytes]:
    stl_files = list(session.stl_files.all())
    range_overrides = session.range_overrides or {}
    has_spiral_range = False
    for ranges in range_overrides.values():
        for range_override in ranges:
            process_overrides = (range_override or {}).get('process_config', {})
            if isinstance(process_overrides, dict) and 'spiral_mode' in process_overrides:
                has_spiral_range = True
                break
        if has_spiral_range:
            break

    if not has_spiral_range:
        return None

    if len(stl_files) != 1:
        raise ValueError(
            "Spiral range slicing is only supported when the session contains exactly one STL."
        )

    file_model = stl_files[0]
    aggregated_ranges = []
    for ranges in range_overrides.values():
        if isinstance(ranges, list):
            aggregated_ranges.extend(ranges)

    special_session = session
    if aggregated_ranges:
        # The frontend currently stores range modifiers as scene/object buckets rather
        # than strictly by STL file id. For the single-STL spiral fallback, treat all
        # provided ranges as applying to that only object.
        special_session = SimpleNamespace(
            config=session.config,
            file_overrides=session.file_overrides,
            range_overrides={str(file_model.file_id): aggregated_ranges},
            custom_gcode_for_z=session.custom_gcode_for_z,
            transforms=session.transforms,
            id=session.id,
        )

    project_config = _load_project_config_for_file(session, file_model)
    stl_bytes = _download_stl_bytes(file_model)
    trimesh = _import_trimesh()
    mesh = trimesh.load(io.BytesIO(stl_bytes), file_type='stl', force='mesh')
    if not isinstance(mesh, trimesh.Trimesh):
        raise ValueError("Spiral range slicing requires a single mesh STL.")

    bed_center = _compute_bed_center(project_config)
    raw_transform = (session.transforms or {}).get(str(file_model.file_id))
    mesh = _apply_print_transform_to_mesh(mesh, raw_transform, bed_center)

    bounds = mesh.bounds
    model_height = float(bounds[1][2] - bounds[0][2])
    special_flow = _extract_spiral_special_flow(special_session, file_model, model_height, project_config)
    if special_flow is None:
        raise ValueError(
            "Spiral range override was provided, but no valid non-spiral base to spiral top "
            "transition could be derived from the session ranges."
        )

    explicit_file_keys = _get_explicit_file_override_keys(session, file_model)
    lower_mesh, upper_mesh, lower_cut_z, upper_cut_z = _split_mesh_with_lower_overlap(
        mesh,
        handoff_z=special_flow['handoff_z'],
        overlap_height=special_flow['lower_overlap_height'],
    )
    _write_debug_stl(f"debug_split_lower_session_{session.id}.stl", lower_mesh)
    _write_debug_stl(f"debug_split_upper_session_{session.id}.stl", upper_mesh)

    lower_project = dict(project_config)
    lower_probe_z = special_flow['handoff_z'] / 2.0
    lower_explicit_keys = explicit_file_keys | _collect_segment_explicit_keys(
        special_session,
        file_model,
        lower_probe_z,
        model_height,
    )
    lower_project = _deep_merge(
        lower_project,
        _collect_segment_scene_overrides(
            special_session,
            file_model,
            lower_probe_z,
            model_height,
            project_config,
        ),
    )
    lower_project['spiral_mode'] = '0'
    lower_project['machine_end_gcode'] = ''
    _set_default_if_not_explicit(lower_project, lower_explicit_keys, 'sparse_infill_density', '0%')
    _set_default_if_not_explicit(lower_project, lower_explicit_keys, 'top_shell_layers', '0')
    _set_default_if_not_explicit(lower_project, lower_explicit_keys, 'top_shell_thickness', '0')

    upper_project = dict(project_config)
    upper_probe_z = special_flow['handoff_z'] + ((model_height - special_flow['handoff_z']) / 2.0)
    upper_explicit_keys = explicit_file_keys | _collect_segment_explicit_keys(
        special_session,
        file_model,
        upper_probe_z,
        model_height,
    )
    upper_project = _deep_merge(
        upper_project,
        _collect_segment_scene_overrides(
            special_session,
            file_model,
            upper_probe_z,
            model_height,
            project_config,
        ),
    )
    upper_project['spiral_mode'] = '1'
    upper_project['machine_start_gcode'] = ''
    _set_default_if_not_explicit(upper_project, upper_explicit_keys, 'wall_loops', '1')
    _set_default_if_not_explicit(upper_project, upper_explicit_keys, 'sparse_infill_density', '0%')
    _set_default_if_not_explicit(upper_project, upper_explicit_keys, 'enable_support', '0')
    _set_default_if_not_explicit(upper_project, upper_explicit_keys, 'top_shell_layers', '0')
    _set_default_if_not_explicit(upper_project, upper_explicit_keys, 'top_shell_thickness', '0')
    _set_default_if_not_explicit(upper_project, upper_explicit_keys, 'bottom_shell_layers', '0')
    _set_default_if_not_explicit(upper_project, upper_explicit_keys, 'bottom_shell_thickness', '0')
    _set_default_if_not_explicit(upper_project, upper_explicit_keys, 'elefant_foot_compensation', '0')
    _set_default_if_not_explicit(upper_project, upper_explicit_keys, 'is_infill_first', '0')

    logger.info(
        "slice_session_task: using special spiral range flow for session=%s file_id=%s "
        "requested_handoff=%.3f snapped_handoff=%.3f lower_cut=%.3f upper_cut=%.3f overlap=%.3f",
        session.id,
        file_model.file_id,
        special_flow['requested_handoff_z'],
        special_flow['handoff_z'],
        lower_cut_z,
        upper_cut_z,
        special_flow['lower_overlap_height'],
    )

    lower_3mf = _build_special_flow_3mf(lower_mesh, lower_project)
    upper_3mf = _build_special_flow_3mf(upper_mesh, upper_project)
    _write_debug_bytes(f"debug_split_lower_session_{session.id}.3mf", lower_3mf)
    _write_debug_bytes(f"debug_split_upper_session_{session.id}.3mf", upper_3mf)
    lower_gcode = call_slicer(lower_3mf)
    upper_gcode = call_slicer(upper_3mf)
    _write_debug_bytes(f"debug_split_lower_session_{session.id}.gcode", lower_gcode)
    _write_debug_bytes(f"debug_split_upper_session_{session.id}.gcode", upper_gcode)
    return _merge_spiral_gcode(
        lower_gcode.decode('utf-8', errors='replace'),
        upper_gcode.decode('utf-8', errors='replace'),
        special_flow['handoff_z'],
    )


def _remove_spiral_mode_from_nested_overrides(overrides):
    normalized = copy.deepcopy(overrides or {})
    for entry in normalized.values() if isinstance(normalized, dict) else []:
        if not isinstance(entry, dict):
            continue
        process_config = entry.get('process_config')
        if isinstance(process_config, dict):
            process_config.pop('spiral_mode', None)
            process_config.pop('bw_vase_mode', None)
    return normalized


def _remove_spiral_mode_from_range_overrides(range_overrides):
    normalized = {}
    for file_id, ranges in (range_overrides or {}).items():
        if not isinstance(ranges, list):
            continue
        kept_ranges = []
        for range_override in ranges:
            if not isinstance(range_override, dict):
                continue
            cleaned = copy.deepcopy(range_override)
            process_config = cleaned.get('process_config')
            had_spiral_mode = isinstance(process_config, dict) and 'spiral_mode' in process_config
            if isinstance(process_config, dict):
                process_config.pop('spiral_mode', None)
                process_config.pop('bw_vase_mode', None)
                if had_spiral_mode and _normalize_spiral_mode(range_override['process_config']['spiral_mode']) == '1':
                    cleaned['process_config'] = process_config
                    process_config.setdefault('wall_loops', '1')
                    process_config.setdefault('sparse_infill_density', '0%')
                    process_config.setdefault('enable_support', '0')
                    process_config.setdefault('top_shell_layers', '0')
                    process_config.setdefault('top_shell_thickness', '0')
                    process_config.setdefault('bottom_shell_layers', '0')
                    process_config.setdefault('bottom_shell_thickness', '0')
                elif had_spiral_mode:
                    # Keep spiral-only non-vase ranges as concrete range modifiers so
                    # Orca doesn't choke on an empty range after spiral_mode is stripped.
                    cleaned['process_config'] = process_config
                    process_config.setdefault('wall_loops', '1')
            has_options = any(
                isinstance(cleaned.get(bucket), dict) and cleaned.get(bucket)
                for bucket in ('process_config', 'machine_config', 'filament_config')
            )
            if has_options:
                kept_ranges.append(cleaned)
        if kept_ranges:
            normalized[file_id] = kept_ranges
    return normalized


def _build_non_spiral_session_for_vase_postprocess(session):
    config = copy.deepcopy(session.config or {})
    process_config = config.setdefault('process_config', {})
    if not isinstance(process_config, dict):
        process_config = {}
        config['process_config'] = process_config
    process_config['spiral_mode'] = '0'
    config['spiral_mode'] = '0'

    return SimpleNamespace(
        id=session.id,
        stl_files=session.stl_files,
        config=config,
        file_overrides=_remove_spiral_mode_from_nested_overrides(session.file_overrides),
        range_overrides=_remove_spiral_mode_from_range_overrides(session.range_overrides),
        custom_gcode_for_z=session.custom_gcode_for_z,
        transforms=session.transforms,
    )


def _maybe_slice_spiral_range_vase_postprocess(session) -> Optional[bytes]:
    stl_files = list(session.stl_files.all())
    range_overrides = session.range_overrides or {}
    has_bw_vase_range = False
    for ranges in range_overrides.values():
        for range_override in ranges:
            process_overrides = (range_override or {}).get('process_config', {})
            if isinstance(process_overrides, dict) and _is_truthy_override(process_overrides.get('bw_vase_mode')):
                has_bw_vase_range = True
                break
        if has_bw_vase_range:
            break

    if not has_bw_vase_range:
        return None

    if len(stl_files) != 1:
        raise ValueError(
            "bw_vase_mode range post-processing is only supported when the session contains exactly one STL."
        )

    file_model = stl_files[0]
    aggregated_ranges = []
    for ranges in range_overrides.values():
        if isinstance(ranges, list):
            aggregated_ranges.extend(ranges)

    special_session = session
    if aggregated_ranges:
        special_session = SimpleNamespace(
            id=session.id,
            stl_files=session.stl_files,
            config=session.config,
            file_overrides=session.file_overrides,
            range_overrides={str(file_model.file_id): aggregated_ranges},
            custom_gcode_for_z=session.custom_gcode_for_z,
            transforms=session.transforms,
        )

    project_config = _load_project_config_for_file(session, file_model)
    stl_bytes = _download_stl_bytes(file_model)
    trimesh = _import_trimesh()
    mesh = trimesh.load(io.BytesIO(stl_bytes), file_type='stl', force='mesh')
    if not isinstance(mesh, trimesh.Trimesh):
        raise ValueError("bw_vase_mode range post-processing requires a single mesh STL.")

    bed_center = _compute_bed_center(project_config)
    raw_transform = (session.transforms or {}).get(str(file_model.file_id))
    mesh = _apply_print_transform_to_mesh(mesh, raw_transform, bed_center)
    bounds = mesh.bounds
    model_height = float(bounds[1][2] - bounds[0][2])
    special_flow = _extract_bw_vase_mode_flow(
        special_session,
        file_model,
        model_height,
        project_config,
    )
    if special_flow is None:
        raise ValueError(
            "bw_vase_mode was enabled, but no valid non-spiral base to spiral top "
            "transition could be derived from the session ranges."
        )

    non_spiral_session = _build_non_spiral_session_for_vase_postprocess(special_session)
    logger.info(
        "slice_session_task: using bw_vase_mode post-process flow for session=%s file_id=%s "
        "requested_handoff=%.3f snapped_handoff=%.3f",
        session.id,
        file_model.file_id,
        special_flow['requested_handoff_z'],
        special_flow['handoff_z'],
    )
    threemf_bytes = build_3mf(non_spiral_session)
    _write_debug_bytes(f"debug_vase_mode_session_{session.id}.3mf", threemf_bytes)
    raw_gcode = call_slicer(threemf_bytes)
    _write_debug_bytes(f"debug_vase_mode_session_{session.id}_raw.gcode", raw_gcode)
    processed_text = _convert_gcode_range_to_vase(
        raw_gcode.decode('utf-8', errors='replace'),
        special_flow['handoff_z'],
    )
    processed_gcode = processed_text.encode('utf-8')
    _write_debug_bytes(f"debug_vase_mode_session_{session.id}_processed.gcode", processed_gcode)
    return processed_gcode




def build_3mf(session) -> bytes:
    """Build a 3MF archive in memory and return the raw bytes.

    Embeds project_settings.config directly in Metadata/ — the same path
    OrcaSlicer uses when it exports its own 3MF projects. This means OrcaSlicer
    CLI reads settings through the same code path as the GUI, producing identical
    slicing results. Sending separate --load-settings files uses a different code
    path and produces worse output.
    """
    stl_files = list(session.stl_files.all())
    project_config = load_project_config(session)
    _validate_export_layer_heights(session, project_config)

    # Download all files — STEP files are converted to STL bytes automatically
    stl_bytes_list = [_download_stl_bytes(f) for f in stl_files]

    bed_center = _compute_bed_center(project_config)
    logger.info(
        f"build_3mf: session={session.id} stl_count={len(stl_files)} bed_center={bed_center} "
        f"semm={project_config.get('single_extruder_multi_material')!r} "
        f"bed_exclude_area={project_config.get('bed_exclude_area')!r} "
        f"flush_volumes_matrix={project_config.get('flush_volumes_matrix')!r} "
        f"nozzle_diameter={project_config.get('nozzle_diameter')!r}"
    )
    logger.info(
        "build_3mf: objects=%d transformed=%d range_groups=%d custom_events=%d",
        len(stl_files), len(session.transforms or {}), len(session.range_overrides or {}),
        len(session.custom_gcode_for_z or []),
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('_rels/.rels', _RELS_CONTENT)
        zf.writestr('[Content_Types].xml', _CONTENT_TYPES_TEMPLATE)
        # Inline mesh XML — parses each STL binary and embeds vertices/triangles directly
        per_object_transforms = [
            session.transforms.get(str(f.file_id)) for f in stl_files
        ]
        zf.writestr('3D/3dmodel.model', _build_3dmodel_xml(
            stl_bytes_list, per_object_transforms, bed_center=bed_center,
        ))
        # Embed the merged project config — OrcaSlicer reads this automatically
        zf.writestr('Metadata/project_settings.config', json.dumps(project_config, indent=2))
        # Per-object config — always written; OrcaSlicer uses this to assign extruders
        # and to recognise the file as a native project (required for transform respect)
        zf.writestr('Metadata/model_settings.config', _build_model_settings_xml(session, stl_files))
        # Range modifiers (e.g. variable layer height) — only written when present
        range_xml = _build_range_overrides_xml(session, stl_files)
        if range_xml:
            zf.writestr('Metadata/layer_config_ranges.xml', range_xml)
        custom_gcode_xml = _build_custom_gcode_per_layer_xml(session)
        if custom_gcode_xml:
            zf.writestr('Metadata/custom_gcode_per_layer.xml', custom_gcode_xml)

    threemf_bytes = buf.getvalue()
    stl_sizes_kb = [round(len(b)/1024, 1) for b in stl_bytes_list]
    logger.info(f"build_3mf: 3MF size={len(threemf_bytes)/1024:.1f} KB, stl_sizes={stl_sizes_kb} KB")

    return threemf_bytes


# ---------------------------------------------------------------------------- #
#                           SLICER HTTP CALL                                   #
# ---------------------------------------------------------------------------- #

def call_slicer(threemf_bytes: bytes) -> bytes:
    """Run OrcaSlicer locally against an in-memory, fully configured 3MF."""
    executable = os.environ.get("ORCA_SLICER_EXECUTABLE", "/opt/orcaslicer/AppRun")
    timeout = int(os.environ.get("SLICER_TIMEOUT_SECONDS", "700"))
    with tempfile.TemporaryDirectory(prefix="standalone-slice-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "model.3mf"
        output_dir = temp_path / "output"
        output_dir.mkdir()
        input_path.write_bytes(threemf_bytes)
        command = [
            "xvfb-run", "--auto-servernum", executable,
            "--no-check", "--normative-check=0", "--arrange", "0",
            "--slice", "0", "--outputdir", str(output_dir), str(input_path),
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "Unknown OrcaSlicer error"
            raise RuntimeError(f"OrcaSlicer exited with code {result.returncode}: {detail[-2000:]}")
        outputs = sorted(output_dir.glob("*.gcode"))
        if not outputs:
            raise RuntimeError("OrcaSlicer completed without producing a G-code file")
        return outputs[0].read_bytes()


def slice_job(job: SliceJob) -> bytes:
    """Build and slice one transient job without storing either input or output."""
    validate_range_overrides(job.range_overrides)
    if not job.models:
        raise ValueError("At least one model is required")
    if _range_overrides_request_bw_vase_mode(job.range_overrides):
        gcode = _maybe_slice_spiral_range_vase_postprocess(job)
    else:
        gcode = _maybe_slice_spiral_range_special_case(job)
    return gcode if gcode is not None else call_slicer(build_3mf(job))
