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


def _profile_index(machine_directory: Path) -> dict[str, Path]:
    index: dict[str, Path] = {}
    for path in machine_directory.rglob("*.json"):
        profile = _read_profile(path)
        name = profile.get("name")
        if isinstance(name, str) and name:
            index[name] = path
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


def printer_preset_gcode(preset_id: str, profiles_root: Path = ORCA_PROFILES_ROOT) -> dict[str, str]:
    relative_path = PRINTER_PROFILE_PATHS.get(preset_id)
    if relative_path is None:
        raise ValueError(f"Unknown printer preset: {preset_id}")
    return load_profile_gcode(Path(profiles_root) / relative_path)
