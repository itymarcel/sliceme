import json
import os
from typing import Any

import httpx


def _string(description: str = "") -> dict[str, Any]:
    result: dict[str, Any] = {"type": "string"}
    if description:
        result["description"] = description
    return result


def _enum(*values: str) -> dict[str, Any]:
    return {"type": "string", "enum": list(values)}


PROCESS_PROPERTIES: dict[str, Any] = {
    "layer_height": _string("Layer height in mm."),
    "initial_layer_print_height": _string("Initial layer height in mm."),
    "line_width": _string("Default extrusion line width in mm."),
    "resolution": _string("Slicing resolution in mm."),
    "seam_position": _enum("aligned", "nearest", "random", "rear"),
    "spiral_mode": _enum("0", "1"),
    "spiral_mode_smooth": _enum("0", "1"),
    "wall_loops": _string(),
    "wall_sequence": _enum("inner wall/outer wall", "outer wall/inner wall", "inner-outer-inner wall"),
    "wall_generator": _enum("arachne", "classic"),
    "top_shell_layers": _string(),
    "bottom_shell_layers": _string(),
    "detect_thin_wall": _enum("0", "1"),
    "precise_outer_wall": _enum("0", "1"),
    "top_surface_pattern": _enum("rectilinear", "monotonic", "monotonicline", "concentric", "hilbertcurve"),
    "bottom_surface_pattern": _enum("rectilinear", "monotonic", "monotonicline", "concentric"),
    "sparse_infill_density": _string("Infill density including a percent sign."),
    "sparse_infill_pattern": _enum("rectilinear", "grid", "triangles", "cubic", "adaptivecubic", "lightning", "honeycomb", "3dhoneycomb", "crosshatch", "gyroid", "concentric"),
    "infill_direction": _string(),
    "initial_layer_speed": _string(),
    "outer_wall_speed": _string(),
    "inner_wall_speed": _string(),
    "sparse_infill_speed": _string(),
    "internal_solid_infill_speed": _string(),
    "top_surface_speed": _string(),
    "travel_speed": _string(),
    "bridge_speed": _string(),
    "outer_wall_acceleration": _string(),
    "bridge_acceleration": _string(),
    "enable_support": _enum("0", "1"),
    "support_threshold_angle": _string(),
    "support_type": _enum("normal(auto)", "tree(auto)", "normal(manual)", "tree(manual)"),
    "support_style": _enum("default", "grid", "snug", "organic", "tree_slim", "tree_strong", "tree_hybrid"),
    "brim_type": _enum("auto_brim", "brim_ears", "painted", "outer_only", "inner_only", "outer_and_inner", "no_brim"),
    "brim_width": _string(),
    "skirt_distance": _string(),
    "raft_layers": _string(),
    "retraction_length": _string(),
    "z_hop": _string(),
    "ironing_type": _enum("no ironing", "top", "topmost", "solid"),
    "elefant_foot_compensation": _string(),
    "bridge_flow": _string(),
    "fuzzy_skin": _enum("none", "external", "hole", "all", "allwalls", "disabled_fuzzy"),
    "fuzzy_skin_thickness": _string(),
}

FILAMENT_PROPERTIES: dict[str, Any] = {
    "filament_type": _enum("PLA", "PETG", "ABS", "ABS-GF", "ASA", "ASA-CF", "PA", "PA-CF", "PC", "PC-CF", "PETG-CF", "PP", "PVA", "TPU"),
    "filament_diameter": _string(),
    "filament_flow_ratio": _string(),
    "filament_max_volumetric_speed": _string(),
    "nozzle_temperature": _string(),
    "nozzle_temperature_initial_layer": _string(),
    "hot_plate_temp": _string(),
    "hot_plate_temp_initial_layer": _string(),
    "fan_min_speed": _string(),
    "fan_max_speed": _string(),
    "close_fan_the_first_x_layers": _string(),
    "full_fan_speed_layer": _string(),
    "additional_cooling_fan_speed": _string(),
    "slow_down_layer_time": _string(),
    "slow_down_for_layer_cooling": _enum("0", "1"),
    "enable_pressure_advance": _enum("0", "1"),
    "pressure_advance": _string(),
    "filament_retraction_length": _string(),
    "filament_retraction_speed": _string(),
    "filament_retraction_minimum_travel": _string(),
    "filament_retract_when_changing_layer": _enum("0", "1"),
    "filament_shrink": _string(),
    "temperature_vitrification": _string(),
}

MACHINE_PROPERTIES: dict[str, Any] = {
    "nozzle_diameter": _enum("0.2", "0.25", "0.4", "0.6", "0.8", "1.0", "1.2", "1.4", "1.6", "1.8", "2.0"),
    "nozzle_type": _enum("undefine", "hardened_steel", "stainless_steel", "brass"),
    "gcode_flavor": _enum("marlin", "klipper", "reprapfirmware"),
}

SLICER_RECOMMENDATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["intent_summary", "confidence", "assumptions", "process_config", "filament_config", "machine_config", "warnings", "user_specified_overrides"],
    "properties": {
        "intent_summary": {"type": "string"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "assumptions": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
        "process_config": {"type": "object", "additionalProperties": False, "required": list(PROCESS_PROPERTIES), "properties": PROCESS_PROPERTIES},
        "filament_config": {"type": "object", "additionalProperties": False, "required": list(FILAMENT_PROPERTIES), "properties": FILAMENT_PROPERTIES},
        "machine_config": {"type": "object", "additionalProperties": False, "required": list(MACHINE_PROPERTIES), "properties": MACHINE_PROPERTIES},
        "warnings": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
        "user_specified_overrides": {"type": "array", "items": {"type": "string"}, "maxItems": 30},
    },
}

CONTEXT_KEYS = {
    "machine_config": {
        "nozzle_diameter", "nozzle_type", "gcode_flavor", "printable_area", "printable_height",
        "machine_max_speed_x", "machine_max_speed_y", "machine_max_speed_z", "machine_max_acceleration_extruding",
    },
    "filament_config": {"filament_type", "filament_diameter"},
    "process_config": {"layer_height", "line_width"},
}


def _scalar(value: Any) -> Any:
    return value[0] if isinstance(value, list) and value else value


def _context(config: dict[str, Any]) -> dict[str, Any]:
    return {
        section: {key: _scalar(values[key]) for key in keys if key in values}
        for section, keys in CONTEXT_KEYS.items()
        if isinstance((values := config.get(section)), dict)
    }


def _output_text(response: dict[str, Any]) -> str:
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    raise ValueError("OpenAI returned no structured recommendation")


def _postprocess(recommendation: dict[str, Any], description: str, config: dict[str, Any]) -> dict[str, Any]:
    process = recommendation["process_config"]
    machine = recommendation["machine_config"]
    overrides = {
        key.rsplit(".", 1)[-1]
        for key in recommendation.get("user_specified_overrides", [])
        if isinstance(key, str)
    }
    current_nozzle = _scalar(config.get("machine_config", {}).get("nozzle_diameter"))
    if current_nozzle is not None and "nozzle_diameter" not in overrides:
        machine["nozzle_diameter"] = str(current_nozzle)

    lowered = description.lower()
    if any(term in lowered for term in ("vase mode", "spiral", "continuous print", "continuous printing")):
        process["spiral_mode"] = "1"
    if process.get("spiral_mode") == "1":
        process.update({
            "wall_loops": "1",
            "sparse_infill_density": "0%",
            "top_shell_layers": "0",
            "enable_support": "0",
        })
    if process.get("brim_width") == "0":
        process["brim_type"] = "no_brim"
    elif process.get("brim_type") == "no_brim":
        process["brim_width"] = "0"
    return recommendation


async def generate_slicer_recommendation(description: str, config: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPEN_AI_KEY")
    if not api_key:
        raise RuntimeError("OpenAI prefill is not configured on the server")

    payload = {"description": description.strip(), "current_printer_and_material": _context(config)}
    request = {
        "model": os.getenv("OPENAI_SLICER_MODEL", "gpt-5.4"),
        "store": False,
        "input": [
            {
                "role": "developer",
                "content": [{
                    "type": "input_text",
                    "text": (
                        "You are a 3D-printing slicer configuration assistant. Return only the structured output. "
                        "Recommend conservative, printable OrcaSlicer settings using the exact keys and option values in the schema. "
                        "Treat values explicitly stated by the user as immutable and list their keys in user_specified_overrides. "
                        "Use the current nozzle, machine limits, and material as context; do not change the current nozzle unless the user explicitly requests another supported diameter. "
                        "Layer height and line width must make physical sense for that nozzle. For spiral or vase printing use one wall, zero infill, zero top layers, and no supports. "
                        "If details are missing, make conservative assumptions and report important caveats in warnings."
                    ),
                }],
            },
            {"role": "user", "content": [{"type": "input_text", "text": json.dumps(payload)}]},
        ],
        "text": {"format": {"type": "json_schema", "name": "slicer_recommendation", "strict": True, "schema": SLICER_RECOMMENDATION_SCHEMA}},
    }
    timeout = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "90"))
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=request,
        )
        response.raise_for_status()
    recommendation = json.loads(_output_text(response.json()))
    return _postprocess(recommendation, description, config)
