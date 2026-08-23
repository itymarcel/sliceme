import copy
import json
from pathlib import Path


_BASE_PROCESS_PATH = Path(__file__).resolve().parent.parent / "profiles" / "fdm_process_common.json"
_METADATA_KEYS = {"type", "name", "from", "instantiation", "inherits", "compatible_printers", "compatible_printers_condition"}

_PRESETS = [
    {
        "id": "draft",
        "name": "Draft · 0.28 mm",
        "description": "Fast prototypes with two walls and 15% infill.",
        "overrides": {
            "layer_height": "0.28", "initial_layer_print_height": "0.28",
            "wall_loops": "2", "top_shell_layers": "3", "bottom_shell_layers": "3",
            "sparse_infill_density": "15%", "sparse_infill_pattern": "grid", "spiral_mode": "0",
        },
    },
    {
        "id": "standard",
        "name": "Standard · 0.20 mm",
        "description": "Balanced quality and speed with three walls and 15% gyroid infill.",
        "overrides": {
            "layer_height": "0.2", "initial_layer_print_height": "0.2",
            "wall_loops": "3", "top_shell_layers": "4", "bottom_shell_layers": "4",
            "sparse_infill_density": "15%", "sparse_infill_pattern": "gyroid", "spiral_mode": "0",
        },
    },
    {
        "id": "fine",
        "name": "Fine · 0.12 mm",
        "description": "Detailed surfaces with three walls and 15% gyroid infill.",
        "overrides": {
            "layer_height": "0.12", "initial_layer_print_height": "0.2",
            "wall_loops": "3", "top_shell_layers": "6", "bottom_shell_layers": "5",
            "sparse_infill_density": "15%", "sparse_infill_pattern": "gyroid", "spiral_mode": "0",
        },
    },
    {
        "id": "strong",
        "name": "Strong · 0.20 mm",
        "description": "Four walls and 30% gyroid infill for functional parts.",
        "overrides": {
            "layer_height": "0.2", "initial_layer_print_height": "0.2",
            "wall_loops": "4", "top_shell_layers": "5", "bottom_shell_layers": "5",
            "sparse_infill_density": "30%", "sparse_infill_pattern": "gyroid", "spiral_mode": "0",
        },
    },
    {
        "id": "vase",
        "name": "Vase · 0.20 mm",
        "description": "Single continuous outer wall with no infill, top shell, or support.",
        "overrides": {
            "layer_height": "0.2", "initial_layer_print_height": "0.2",
            "wall_loops": "1", "top_shell_layers": "0", "bottom_shell_layers": "4",
            "sparse_infill_density": "0%", "spiral_mode": "1", "enable_support": "0",
        },
    },
]


def _base_process_config() -> dict:
    raw = json.loads(_BASE_PROCESS_PATH.read_text(encoding="utf-8"))
    return {key: value for key, value in raw.items() if key not in _METADATA_KEYS}


def list_print_presets() -> list[dict[str, str]]:
    return [
        {"id": preset["id"], "name": preset["name"], "description": preset["description"]}
        for preset in _PRESETS
    ]


def print_preset_config(preset_id: str) -> dict:
    preset = next((item for item in _PRESETS if item["id"] == preset_id), None)
    if preset is None:
        raise ValueError("Unknown print preset")
    config = _base_process_config()
    config.update(copy.deepcopy(preset["overrides"]))
    return config
