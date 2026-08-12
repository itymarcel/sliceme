import re
from collections.abc import Callable

from .gradient_perimeter_echo import GradientPerimeterEchoConfig, process_gcode


FLOAT = r"[-+]?(?:\d+\.?\d*|\.\d+)"
E_VALUE = re.compile(rf"(?<![A-Za-z])E({FLOAT})", re.IGNORECASE)
F_VALUE = re.compile(rf"(?<![A-Za-z])F({FLOAT})", re.IGNORECASE)
MOVE_PARAM = re.compile(rf"(?<![A-Za-z])([XYZ])({FLOAT})", re.IGNORECASE)
LAYER_MARKER = re.compile(
    r"^;\s*(?:layer\s+(?:num/total_layer_count:\s*)?|layer_change\b|change_layer\b)",
    re.IGNORECASE,
)


def _with_marker(gcode: str, operation: str) -> str:
    marker = f"; sliceme enhancement: {operation}"
    if marker in gcode:
        raise ValueError(f"{operation} has already been applied")
    return f"{marker}\n{gcode.rstrip()}\n"


def convert_absolute_to_relative_e(gcode: str) -> str:
    """Automator's absolute-to-relative conversion, preserving inline comments."""
    output: list[str] = []
    absolute_mode = True
    last_e = 0.0
    for original in gcode.splitlines():
        code, separator, comment = original.partition(";")
        stripped = code.strip()
        command = stripped.split(maxsplit=1)[0].upper() if stripped else ""
        if command == "M82":
            absolute_mode = True
            output.append("M83 ; converted to relative by SliceMe enhancement")
            continue
        if command == "M83":
            absolute_mode = False
            output.append(original)
            continue
        if command == "G92" and E_VALUE.search(code):
            last_e = float(E_VALUE.search(code).group(1))
            output.append(original)
            continue
        if absolute_mode and E_VALUE.search(code):
            def relative(match: re.Match[str]) -> str:
                nonlocal last_e
                current = float(match.group(1))
                delta = current - last_e
                last_e = current
                return f"E{delta:.5f}"

            code = E_VALUE.sub(relative, code)
            output.append(f"{code}{separator}{comment}")
        else:
            output.append(original)
    return "\n".join(output)


def perimeter_echo(gcode: str) -> str:
    relative_gcode = convert_absolute_to_relative_e(gcode)
    result = process_gcode(relative_gcode, GradientPerimeterEchoConfig())
    if not result.success:
        raise ValueError(result.error_message or "No suitable closed outer perimeter was found")
    return _with_marker(result.processed_content, "perimeter_echo")


def slower_motion(gcode: str, factor: float = 0.8, upper_limit: float = 3000) -> str:
    """Automator feedrate pass: slow printing moves while retaining fast machine moves."""
    def adjust_line(line: str) -> str:
        code = line.split(";", 1)[0]
        pure_extrusion = code.lstrip().upper().startswith("G1") and E_VALUE.search(code) and not MOVE_PARAM.search(code)
        if pure_extrusion:
            return line

        def adjust(match: re.Match[str]) -> str:
            current = float(match.group(1))
            return f"F{round(current * factor) if current < upper_limit else current:g}"

        return F_VALUE.sub(adjust, line)

    return _with_marker("\n".join(adjust_line(line) for line in gcode.splitlines()), "slow_motion_80")


def _layer_blocks(gcode: str) -> tuple[list[str], list[list[str]], list[str]]:
    """Split Orca/Prusa-style G-code without depending on one exact layer comment."""
    lines = gcode.splitlines()
    starts = [index for index, line in enumerate(lines) if LAYER_MARKER.match(line)]
    if not starts:
        # Orca always emits layer comments, but fall back to extrusion Z changes
        # so API callers with compatible G-code still receive a useful error.
        raise ValueError("No layer markers were found in this G-code")
    start = lines[:starts[0]]
    layers = [lines[layer_start:starts[index + 1] if index + 1 < len(starts) else len(lines)] for index, layer_start in enumerate(starts)]
    return start, layers, []


def _ease_extrusion(lines: list[str], start_multiplier: float, end_multiplier: float) -> list[str]:
    indices = [
        index
        for index, line in enumerate(lines)
        if not line.lstrip().startswith(";")
        and (match := E_VALUE.search(line)) is not None
        and float(match.group(1)) > 0
    ]
    if len(indices) < 2:
        raise ValueError("The target layer does not contain enough extrusion moves")
    output = list(lines)
    denominator = len(indices) - 1
    for position, line_index in enumerate(indices):
        multiplier = start_multiplier + (end_multiplier - start_multiplier) * (position / denominator)
        output[line_index] = E_VALUE.sub(lambda match: f"E{float(match.group(1)) * multiplier:.5f}", output[line_index])
    return output


def coast_final_layer(gcode: str) -> str:
    start, layers, end = _layer_blocks(gcode)
    layers[-1] = _ease_extrusion(layers[-1], 1.0, 0.25)
    processed = "\n".join(start + [line for layer in layers for line in layer] + end)
    return _with_marker(processed, "coast_final_layer")


def _is_spiral_layer(lines: list[str]) -> bool:
    moves = 0
    z_moves = 0
    for line in lines:
        code = line.split(";", 1)[0].strip().upper()
        if not code.startswith(("G0", "G1")):
            continue
        moves += 1
        if re.search(rf"(?<![A-Za-z])Z{FLOAT}", code):
            z_moves += 1
    return moves > 0 and z_moves / moves > 0.5


def smooth_vase_transition(gcode: str) -> str:
    start, layers, end = _layer_blocks(gcode)
    transition_index = next((index for index in range(1, len(layers)) if not _is_spiral_layer(layers[index - 1]) and _is_spiral_layer(layers[index])), None)
    if transition_index is None:
        raise ValueError("No standard-to-spiral layer transition was found")
    layers[transition_index] = _ease_extrusion(layers[transition_index], 0.6, 0.9)
    processed = "\n".join(start + [line for layer in layers for line in layer] + end)
    return _with_marker(processed, "smooth_vase_transition")


ENHANCEMENTS: dict[str, Callable[[str], str]] = {
    "perimeter_echo": perimeter_echo,
    "smooth_vase_transition": smooth_vase_transition,
    "coast_final_layer": coast_final_layer,
    "slow_motion_80": slower_motion,
}


def apply_enhancement(gcode: str, operation: str) -> str:
    enhancer = ENHANCEMENTS.get(operation)
    if enhancer is None:
        raise ValueError(f"Unknown G-code enhancement: {operation}")
    if not gcode.strip():
        raise ValueError("G-code is empty")
    return enhancer(gcode)
