from dataclasses import dataclass, field
import io
import json
import math
from pathlib import Path
from pathlib import PurePosixPath
import re
import struct
import xml.etree.ElementTree as ET
import zipfile

MAX_ARCHIVE_ENTRIES = 256
MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
MAX_MODEL_XML_BYTES = 100 * 1024 * 1024
MAX_IMPORTED_MODELS = 12
MAX_COMPONENT_DEPTH = 12
MAX_COMPONENT_INSTANCES = 10_000
MAX_EXPANDED_VERTICES = 500_000
MAX_EXPANDED_TRIANGLES = 500_000
MAX_GENERATED_STL_BYTES = 50 * 1024 * 1024
CORE_NS = "{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}"
UNIT_TO_MM = {
    "micron": 0.001,
    "millimeter": 1.0,
    "centimeter": 10.0,
    "inch": 25.4,
    "foot": 304.8,
    "meter": 1000.0,
}


@dataclass(frozen=True)
class ImportedModel:
    name: str
    stl: bytes
    position: dict[str, float]
    overrides: dict[str, dict] = field(default_factory=dict)
    range_overrides: list[dict] = field(default_factory=list)
    modifier_for_index: int | None = None


@dataclass(frozen=True)
class ImportedProject:
    models: list[ImportedModel]
    config: dict[str, dict]
    warnings: list[str]


def _matrix(raw: str | None) -> tuple[float, ...]:
    if not raw:
        return (1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0)
    values = tuple(float(value) for value in raw.split())
    if len(values) != 12 or not all(math.isfinite(value) for value in values):
        raise ValueError("Invalid 3MF transform")
    return values


def _point(matrix: tuple[float, ...], vertex: tuple[float, float, float]) -> tuple[float, float, float]:
    m00, m01, m02, m10, m11, m12, m20, m21, m22, tx, ty, tz = matrix
    x, y, z = vertex
    result = (
        m00 * x + m10 * y + m20 * z + tx,
        m01 * x + m11 * y + m21 * z + ty,
        m02 * x + m12 * y + m22 * z + tz,
    )
    if not all(math.isfinite(value) for value in result):
        raise ValueError("3MF transform produced non-finite coordinates")
    return result


def _compose(parent: tuple[float, ...], child: tuple[float, ...]) -> tuple[float, ...]:
    # 3MF stores the affine matrix by columns. Compose by transforming the
    # child basis vectors and origin through the parent matrix.
    origin = _point(parent, (child[9], child[10], child[11]))
    columns = []
    for column in ((child[0], child[1], child[2]), (child[3], child[4], child[5]), (child[6], child[7], child[8])):
        transformed = _point(parent, column)
        parent_origin = _point(parent, (0, 0, 0))
        columns.extend(transformed[index] - parent_origin[index] for index in range(3))
    return (*columns, *origin)


def _binary_stl(vertices: list[tuple[float, float, float]], triangles: list[tuple[int, int, int]], name: str) -> bytes:
    header = name.encode("utf-8", errors="replace")[:80].ljust(80, b"\0")
    output = bytearray(header + struct.pack("<I", len(triangles)))
    for a, b, c in triangles:
        p1, p2, p3 = vertices[a], vertices[b], vertices[c]
        ab = tuple(p2[index] - p1[index] for index in range(3))
        ac = tuple(p3[index] - p1[index] for index in range(3))
        cross = (
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        )
        length = math.sqrt(sum(value * value for value in cross))
        normal = tuple(value / length for value in cross) if length else (0.0, 0.0, 0.0)
        output.extend(struct.pack("<12fH", *normal, *p1, *p2, *p3, 0))
    return bytes(output)


def _safe_name(raw: str, index: int) -> str:
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", raw).strip(" ._") or f"Imported model {index}"
    return f"{Path(stem).stem}.stl"


def _project_config(raw: dict, defaults: dict[str, dict]) -> tuple[dict[str, dict], list[str]]:
    result = {section: dict(defaults.get(section, {})) for section in ("machine_config", "process_config", "filament_config")}
    machine_keys = set(result["machine_config"])
    process_keys = set(result["process_config"])
    filament_keys = set(result["filament_config"])
    ignored = 0
    for key, value in raw.items():
        if "gcode" in key.lower():
            ignored += 1
            continue
        if key in machine_keys:
            section = "machine_config"
        elif key in filament_keys:
            section = "filament_config"
        elif key in process_keys:
            section = "process_config"
        else:
            ignored += 1
            continue
        result[section][key] = value
    warnings = [f"{ignored} unsupported or unsafe project settings were ignored"] if ignored else []
    return result, warnings


def _object_overrides(raw: dict[str, str], defaults: dict[str, dict]) -> dict[str, dict]:
    result = {section: {} for section in ("machine_config", "process_config", "filament_config")}
    section_for_key = {
        key: section
        for section in result
        for key in defaults.get(section, {})
    }
    for key, value in raw.items():
        section = section_for_key.get(key)
        if section and "gcode" not in key.lower():
            result[section][key] = value
    return {section: values for section, values in result.items() if values}


def import_orca_project(data: bytes, defaults: dict[str, dict]) -> ImportedProject:
    try:
        package = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise ValueError("Invalid 3MF archive") from error
    with package:
        infos = package.infolist()
        for info in infos:
            path = PurePosixPath(info.filename)
            mode = info.external_attr >> 16
            if path.is_absolute() or ".." in path.parts or (mode & 0o170000) == 0o120000:
                raise ValueError("3MF archive contains an unsafe path")
        if len(infos) > MAX_ARCHIVE_ENTRIES or sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_BYTES:
            raise ValueError("3MF archive is too large")
        if "3D/3dmodel.model" not in package.namelist():
            raise ValueError("3MF archive has no model document")
        model_bytes = package.read("3D/3dmodel.model")
        if len(model_bytes) > MAX_MODEL_XML_BYTES or b"<!DOCTYPE" in model_bytes.upper():
            raise ValueError("Unsafe or oversized 3MF model document")
        try:
            root = ET.fromstring(model_bytes)
        except ET.ParseError as error:
            raise ValueError("Invalid 3MF model XML") from error
        unit = root.get("unit", "millimeter")
        if unit not in UNIT_TO_MM:
            raise ValueError(f"Unsupported 3MF unit: {unit}")
        unit_scale = UNIT_TO_MM[unit]

        names: dict[str, str] = {}
        object_metadata: dict[str, dict] = {}
        if "Metadata/model_settings.config" in package.namelist():
            metadata = package.read("Metadata/model_settings.config")
            if b"<!DOCTYPE" not in metadata.upper():
                try:
                    meta_root = ET.fromstring(metadata)
                    for obj in meta_root.findall(".//object"):
                        object_id = obj.get("id", "")
                        raw_object_metadata = {
                            item.get("key", ""): item.get("value", "")
                            for item in obj.findall("metadata")
                        }
                        name = raw_object_metadata.pop("name", None)
                        raw_object_metadata.pop("extruder", None)
                        if name:
                            names[object_id] = name
                        parts = []
                        for part in obj.findall("part"):
                            raw_part_metadata = {
                                item.get("key", ""): item.get("value", "")
                                for item in part.findall("metadata")
                            }
                            part_name = raw_part_metadata.pop("name", None)
                            for structural_key in ("matrix", "model_start_point_enabled", "model_start_point_x", "model_start_point_y"):
                                raw_part_metadata.pop(structural_key, None)
                            parts.append({
                                "id": part.get("id", ""),
                                "subtype": part.get("subtype", "normal_part"),
                                "name": part_name,
                                "settings": raw_part_metadata,
                            })
                        object_metadata[object_id] = {
                            "settings": raw_object_metadata,
                            "parts": parts,
                        }
                except ET.ParseError:
                    pass

        range_overrides_by_object: dict[int, list[dict]] = {}
        if "Metadata/layer_config_ranges.xml" in package.namelist():
            ranges_bytes = package.read("Metadata/layer_config_ranges.xml")
            if len(ranges_bytes) > 2 * 1024 * 1024 or b"<!DOCTYPE" in ranges_bytes.upper():
                raise ValueError("Unsafe or oversized layer range metadata")
            try:
                ranges_root = ET.fromstring(ranges_bytes)
            except ET.ParseError as error:
                raise ValueError("Invalid layer range metadata") from error
            for object_node in ranges_root.findall("./object"):
                try:
                    logical_id = int(object_node.get("id", ""))
                except ValueError as error:
                    raise ValueError("Invalid layer range object ID") from error
                parsed_ranges = []
                for range_node in object_node.findall("./range"):
                    try:
                        min_z = float(range_node.get("min_z", ""))
                        max_z = float(range_node.get("max_z", ""))
                    except ValueError as error:
                        raise ValueError("Invalid layer range boundary") from error
                    if not math.isfinite(min_z) or not math.isfinite(max_z) or min_z < 0 or max_z <= min_z:
                        raise ValueError("Invalid layer range boundary")
                    raw_options = {
                        option.get("opt_key", ""): (option.text or "")
                        for option in range_node.findall("./option")
                    }
                    options = _object_overrides(raw_options, defaults)
                    entry = {
                        "range": {"min_z": min_z, "max_z": max_z},
                        "machine_config": options.get("machine_config", {}),
                        "process_config": options.get("process_config", {}),
                        "filament_config": options.get("filament_config", {}),
                    }
                    if "layer_height" in entry["process_config"]:
                        entry["purpose"] = "variable_layer"
                    if any(entry[section] for section in ("machine_config", "process_config", "filament_config")):
                        parsed_ranges.append(entry)
                range_overrides_by_object[logical_id] = parsed_ranges

        resources = root.find(f"{CORE_NS}resources")
        build = root.find(f"{CORE_NS}build")
        build_items = list(build) if build is not None else []
        if len(build_items) > MAX_IMPORTED_MODELS:
            raise ValueError(f"3MF projects may import at most {MAX_IMPORTED_MODELS} models")
        objects = {obj.get("id", ""): obj for obj in (list(resources) if resources is not None else []) if obj.tag == f"{CORE_NS}object"}
        expanded_vertices = 0
        expanded_triangles = 0
        component_instances = 0

        def resolve(object_id: str, transform: tuple[float, ...], stack: frozenset[str], depth: int = 0) -> tuple[list, list]:
            nonlocal expanded_vertices, expanded_triangles, component_instances
            component_instances += 1
            if component_instances > MAX_COMPONENT_INSTANCES:
                raise ValueError(f"3MF component instances exceed {MAX_COMPONENT_INSTANCES}")
            if depth > MAX_COMPONENT_DEPTH:
                raise ValueError(f"3MF component depth exceeds {MAX_COMPONENT_DEPTH}")
            if object_id in stack:
                raise ValueError("Cyclic 3MF components")
            obj = objects.get(object_id)
            if obj is None:
                raise ValueError(f"Missing 3MF object {object_id}")
            mesh = obj.find(f"{CORE_NS}mesh")
            if mesh is not None:
                vertices_node = mesh.find(f"{CORE_NS}vertices")
                triangles_node = mesh.find(f"{CORE_NS}triangles")
                vertices = []
                for vertex in (list(vertices_node) if vertices_node is not None else []):
                    raw_vertex = tuple(float(vertex.get(axis, "0")) for axis in ("x", "y", "z"))
                    if not all(math.isfinite(value) for value in raw_vertex):
                        raise ValueError("3MF vertices must be finite")
                    vertices.append(_point(transform, raw_vertex))
                triangles = [tuple(int(triangle.get(key, "-1")) for key in ("v1", "v2", "v3")) for triangle in (list(triangles_node) if triangles_node is not None else [])]
                if any(index < 0 or index >= len(vertices) for triangle in triangles for index in triangle):
                    raise ValueError("Invalid 3MF triangle index")
                expanded_vertices += len(vertices)
                expanded_triangles += len(triangles)
                if expanded_vertices > MAX_EXPANDED_VERTICES or expanded_triangles > MAX_EXPANDED_TRIANGLES:
                    raise ValueError("3MF expanded geometry exceeds safe limits")
                return vertices, triangles
            components = obj.find(f"{CORE_NS}components")
            all_vertices: list = []
            all_triangles: list = []
            for component in (list(components) if components is not None else []):
                vertices, triangles = resolve(
                    component.get("objectid", ""),
                    _compose(transform, _matrix(component.get("transform"))),
                    stack | {object_id},
                    depth + 1,
                )
                offset = len(all_vertices)
                all_vertices.extend(vertices)
                all_triangles.extend(tuple(index + offset for index in triangle) for triangle in triangles)
            return all_vertices, all_triangles

        imported: list[ImportedModel] = []
        generated_stl_bytes = 0

        def append_model(
            object_id: str | list[str],
            transform: tuple[float, ...] | list[tuple[float, ...]],
            name: str,
            overrides: dict[str, dict],
            range_overrides: list[dict] | None = None,
            modifier_for_index: int | None = None,
            parent_min_z: float | None = None,
        ) -> float | None:
            nonlocal generated_stl_bytes
            if isinstance(object_id, list):
                if not isinstance(transform, list) or len(object_id) != len(transform):
                    raise ValueError("Invalid multipart 3MF object")
                sources = zip(object_id, transform)
            else:
                if isinstance(transform, list):
                    raise ValueError("Invalid 3MF object transform")
                sources = [(object_id, transform)]
            vertices: list = []
            triangles: list = []
            for source_id, source_transform in sources:
                source_vertices, source_triangles = resolve(source_id, source_transform, frozenset())
                offset = len(vertices)
                vertices.extend(source_vertices)
                triangles.extend(tuple(vertex + offset for vertex in triangle) for triangle in source_triangles)
            if not vertices or not triangles:
                return None
            if unit_scale != 1.0:
                vertices = [tuple(value * unit_scale for value in vertex) for vertex in vertices]
            xs, ys, zs = zip(*vertices)
            center_x = (min(xs) + max(xs)) / 2
            center_y = (min(ys) + max(ys)) / 2
            min_z = min(zs)
            local_vertices = [(x - center_x, y - center_y, z - min_z) for x, y, z in vertices]
            safe_name = _safe_name(name, len(imported) + 1)
            stl = _binary_stl(local_vertices, triangles, safe_name)
            generated_stl_bytes += len(stl)
            if generated_stl_bytes > MAX_GENERATED_STL_BYTES:
                raise ValueError("3MF generated model data exceeds safe limits")
            position = {"x": center_x, "y": center_y}
            if parent_min_z is not None:
                position["z"] = min_z - parent_min_z
            imported.append(ImportedModel(
                name=safe_name,
                stl=stl,
                position=position,
                overrides=overrides,
                range_overrides=range_overrides or [],
                modifier_for_index=modifier_for_index,
            ))
            if len(imported) > MAX_IMPORTED_MODELS:
                raise ValueError(f"3MF projects may import at most {MAX_IMPORTED_MODELS} models")
            return min_z

        for index, item in enumerate(build_items, 1):
            object_id = item.get("objectid", "")
            item_transform = _matrix(item.get("transform"))
            metadata_entry = object_metadata.get(object_id, {})
            parts = metadata_entry.get("parts", [])
            obj = objects.get(object_id)
            components_node = obj.find(f"{CORE_NS}components") if obj is not None else None
            components = {
                component.get("objectid", ""): _compose(item_transform, _matrix(component.get("transform")))
                for component in (list(components_node) if components_node is not None else [])
            }

            recognized_parts = [part for part in parts if part.get("id") in components]
            normal_parts = [part for part in recognized_parts if part.get("subtype") != "modifier_part"]
            modifier_parts = [part for part in recognized_parts if part.get("subtype") == "modifier_part"]
            modifier_ids = {part["id"] for part in modifier_parts}
            normal_source_ids = [component_id for component_id in components if component_id not in modifier_ids]
            if normal_source_ids and recognized_parts:
                normal_settings = dict(metadata_entry.get("settings", {}))
                for normal_part in normal_parts:
                    normal_settings.update(normal_part.get("settings", {}))
                parent_index = len(imported)
                parent_min_z = append_model(
                    normal_source_ids,
                    [components[source_id] for source_id in normal_source_ids],
                    (normal_parts[0].get("name") if normal_parts else None) or names.get(object_id, f"Imported model {index}"),
                    _object_overrides(normal_settings, defaults),
                    range_overrides_by_object.get(index, []),
                )
                if len(imported) == parent_index or parent_min_z is None:
                    continue
                for modifier in modifier_parts:
                    append_model(
                        modifier["id"], components[modifier["id"]],
                        modifier.get("name") or f"Modifier {len(imported) + 1}",
                        _object_overrides(modifier.get("settings", {}), defaults),
                        modifier_for_index=parent_index,
                        parent_min_z=parent_min_z,
                    )
                continue

            append_model(
                object_id, item_transform,
                names.get(object_id, f"Imported model {index}"),
                _object_overrides(metadata_entry.get("settings", {}), defaults),
                range_overrides_by_object.get(index, []),
            )

        if not imported:
            raise ValueError("3MF project contains no buildable mesh objects")
        raw_settings = {}
        if "Metadata/project_settings.config" in package.namelist():
            try:
                raw_settings = json.loads(package.read("Metadata/project_settings.config"))
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                raise ValueError("Invalid Orca project settings") from error
            if not isinstance(raw_settings, dict):
                raise ValueError("Invalid Orca project settings")
        config, warnings = _project_config(raw_settings, defaults)
        return ImportedProject(imported, config, warnings)
