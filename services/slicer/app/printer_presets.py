import base64
import json
import os
from pathlib import Path


ORCA_PROFILES_ROOT = Path(os.environ.get("ORCA_PROFILES_ROOT", "/opt/orcaslicer/resources/profiles"))

PRINTER_PROFILE_PATHS = {
    "bambu-a1": "BBL/machine/Bambu Lab A1 0.4 nozzle.json",
    "bambu-a1-mini": "BBL/machine/Bambu Lab A1 mini 0.4 nozzle.json",
    "bambu-p1s": "BBL/machine/Bambu Lab P1S 0.4 nozzle.json",
    "bambu-x1c": "BBL/machine/Bambu Lab X1 Carbon 0.4 nozzle.json",
    "prusa-mk4s": "Prusa/machine/Prusa MK4S 0.4 nozzle.json",
    "creality-ender-3-v3-se": "Creality/machine/Creality Ender-3 V3 SE 0.4 nozzle.json",
    "creality-k1c": "Creality/machine/Creality K1C 0.4 nozzle.json",
    "elegoo-neptune-4-pro": "Elegoo/machine/EN4SERIES/Elegoo Neptune 4 Pro 0.4 nozzle.json",
    "anycubic-kobra-3": "Anycubic/machine/Anycubic Kobra 3 0.4 nozzle.json",
}
LEGACY_ID_BY_PATH = {path: preset_id for preset_id, path in PRINTER_PROFILE_PATHS.items()}

_PROFILE_METADATA_KEYS = {
    "name", "inherits", "instantiation", "type", "from", "version",
    "is_custom_defined", "description", "setting_id", "printer_model",
}


def encode_preset_id(relative_path: Path) -> str:
    encoded = base64.urlsafe_b64encode(relative_path.as_posix().encode("utf-8")).decode("ascii")
    return encoded.rstrip("=")


def decode_preset_id(preset_id: str) -> Path:
    try:
        padded = preset_id + "=" * (-len(preset_id) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as error:
        raise ValueError("Invalid printer preset") from error
    path = Path(decoded)
    if path.is_absolute() or ".." in path.parts or path.suffix.lower() != ".json":
        raise ValueError("Invalid printer preset")
    return path


def _read_profile(path: Path) -> dict:
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not load printer G-code profile: {path.name}") from error
    if not isinstance(value, dict):
        raise ValueError(f"Printer G-code profile must be an object: {path.name}")
    return value


def _machine_directory(profile_path: Path) -> Path:
    for parent in (profile_path.parent, *profile_path.parents):
        if parent.name == "machine":
            return parent
    raise ValueError(f"Printer profile is outside a machine directory: {profile_path.name}")


def _profile_index(machine_directory: Path, allowed_root: Path | None = None) -> dict[str, Path]:
    index: dict[str, Path] = {}
    root = (allowed_root or machine_directory).resolve()
    for path in machine_directory.rglob("*.json"):
        if path.is_symlink():
            continue
        resolved_path = path.resolve()
        try:
            resolved_path.relative_to(root)
        except ValueError:
            continue
        profile = _read_profile(resolved_path)
        name = profile.get("name")
        if isinstance(name, str) and name:
            index[name] = resolved_path
    return index


def _resolved_profile(profile_path: Path, index: dict[str, Path], resolving: set[str]) -> dict:
    profile = _read_profile(profile_path)
    name = str(profile.get("name") or profile_path.name)
    if name in resolving:
        raise ValueError(f"Printer profile inheritance cycle at {name}")

    result: dict = {}
    parent_name = profile.get("inherits")
    if isinstance(parent_name, str) and parent_name:
        parent_path = index.get(parent_name)
        if parent_path is None:
            raise ValueError(f"Missing inherited printer profile: {parent_name}")
        result.update(_resolved_profile(parent_path, index, resolving | {name}))
    result.update(profile)
    return result


def _gcode_scalar(value):
    if isinstance(value, list):
        return value[0] if value else ""
    return value


def load_profile_gcode(profile_path: Path) -> dict[str, str]:
    """Resolve an Orca machine profile and return only its injected G-code fields."""
    profile_path = Path(profile_path)
    resolved = _resolved_profile(profile_path, _profile_index(_machine_directory(profile_path)), set())
    return {
        key: str(_gcode_scalar(value))
        for key, value in resolved.items()
        if key.endswith("_gcode")
        and key != "emit_machine_limits_to_gcode"
        and value is not None
    }


def load_profile_config(profile_path: Path, allowed_root: Path | None = None) -> dict:
    """Resolve a machine profile and return its complete slicer configuration."""
    profile_path = Path(profile_path).resolve()
    resolved = _resolved_profile(
        profile_path,
        _profile_index(_machine_directory(profile_path), allowed_root),
        set(),
    )
    return {key: value for key, value in resolved.items() if key not in _PROFILE_METADATA_KEYS}


def list_printer_presets(profiles_root: Path = ORCA_PROFILES_ROOT) -> list[dict]:
    """List concrete Orca machine profiles without exposing filesystem paths."""
    root = Path(profiles_root).resolve()
    presets = []
    indexes: dict[Path, dict[str, Path]] = {}
    if not root.is_dir():
        return presets
    for path in root.glob("*/machine/**/*.json"):
        if path.is_symlink():
            continue
        resolved_path = path.resolve()
        try:
            relative = resolved_path.relative_to(root)
        except ValueError:
            continue
        try:
            profile = _read_profile(resolved_path)
        except ValueError:
            continue
        if str(profile.get("instantiation", "")).lower() not in {"true", "1"}:
            continue
        name = profile.get("name")
        if not isinstance(name, str) or not name:
            continue
        nozzle = profile.get("nozzle_diameter")
        if nozzle is None:
            machine_directory = _machine_directory(resolved_path)
            index = indexes.setdefault(machine_directory, _profile_index(machine_directory, root))
            try:
                nozzle = _resolved_profile(resolved_path, index, set()).get("nozzle_diameter")
            except ValueError:
                continue
        presets.append({
            "id": LEGACY_ID_BY_PATH.get(relative.as_posix(), encode_preset_id(relative)),
            "manufacturer": relative.parts[0],
            "name": name,
            "model": str(profile.get("printer_model") or name),
            "nozzle_diameter": nozzle if isinstance(nozzle, list) else ([str(nozzle)] if nozzle is not None else []),
        })
    return sorted(presets, key=lambda item: (item["manufacturer"].casefold(), item["name"].casefold()))


def printer_preset_config(preset_id: str, profiles_root: Path = ORCA_PROFILES_ROOT) -> dict:
    root = Path(profiles_root).resolve()
    relative = Path(PRINTER_PROFILE_PATHS[preset_id]) if preset_id in PRINTER_PROFILE_PATHS else decode_preset_id(preset_id)
    candidate = root / relative
    if candidate.is_symlink():
        raise ValueError("Invalid printer preset")
    profile_path = candidate.resolve()
    try:
        profile_path.relative_to(root)
    except ValueError as error:
        raise ValueError("Invalid printer preset") from error
    if not profile_path.is_file():
        raise ValueError("Unknown printer preset")
    return load_profile_config(profile_path, root)


def printer_preset_gcode(preset_id: str, profiles_root: Path = ORCA_PROFILES_ROOT) -> dict[str, str]:
    config = printer_preset_config(preset_id, profiles_root)
    return {
        key: str(_gcode_scalar(value))
        for key, value in config.items()
        if key.endswith("_gcode")
        and key != "emit_machine_limits_to_gcode"
        and value is not None
    }
