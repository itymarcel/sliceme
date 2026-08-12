"""
Main processor for Gradient Perimeter Echo and modification operations.

This module provides the high-level interface for processing G-code files
with gradient perimeter echo, segmentation, ending copy, and various adjustments.
"""

import logging
from typing import List, Optional, Tuple

from .models import GradientPerimeterEchoConfig, SegmentationResult, Point2D
from .detector import PerimeterDetector
from .segmenter import GradientLineSegmenter, GradientExtrusionAdjuster, GradientFeedrateAdjuster
from .parser import GCodeParser
from .utils import CoordinateFinder

logger = logging.getLogger(__name__)


class EndingCopier:
    """Handles copying the ending section to the front of the perimeter for gradient echo effect."""
    
    def __init__(self, config: GradientPerimeterEchoConfig):
        self.config = config
    
    def copy_ending_to_front(self, lines: List[str], section, end_coordinates: Point2D) -> List[str]:
        """
        Copy the last portion of the outer perimeter to the front.
        
        Args:
            lines: List of G-code lines (already segmented)
            section: PerimeterSection object
            end_coordinates: Coordinates of the perimeter end
            
        Returns:
            Modified list of lines with ending copied to front
        """
        # Calculate copy distance
        copy_distance = self._calculate_copy_distance(lines, section)
        
        # Find perimeter boundaries in segmented lines
        actual_start_index, actual_end_index = self._find_segmented_perimeter_boundaries(
            lines, section, end_coordinates
        )
        
        # Find lines to copy
        copy_lines, split_start_index, split_end_index = self._find_lines_to_copy(
            lines, actual_start_index, actual_end_index, end_coordinates, copy_distance
        )
        
        if not copy_lines:
            logger.warning("No lines found within copy distance")
            return lines
        
        logger.info(f"Found {len(copy_lines)} lines to copy")
        
        # Create the modified structure
        new_lines = self._create_modified_structure(
            lines, actual_start_index, actual_end_index, copy_lines, split_start_index, split_end_index
        )
        
        # Apply adjustments
        new_lines = self._apply_all_adjustments(
            new_lines, len(copy_lines), actual_start_index, actual_end_index, 
            split_start_index, section
        )
        
        logger.info("Successfully copied ending to front")
        return new_lines
    
    def _calculate_copy_distance(self, lines: List[str], section) -> float:
        """Calculate the distance to copy based on perimeter distance and configuration."""
        total_perimeter_distance = self._calculate_total_perimeter_distance(lines, section)
        copy_distance = min(
            total_perimeter_distance * self.config.copy_ending_percentage,
            self.config.max_copy_distance
        )
        
        logger.info(f"Total perimeter distance: {total_perimeter_distance:.2f}mm")
        logger.info(f"Copying last {copy_distance:.2f}mm ({self.config.copy_ending_percentage*100:.0f}%) of outer perimeter to front")
        
        return copy_distance
    
    def _find_segmented_perimeter_boundaries(self, lines: List[str], section, 
                                           end_coordinates: Point2D) -> Tuple[int, int]:
        """Find the actual start and end indices of the perimeter in segmented lines."""
        # Use the perimeter boundaries from the detector (preserved after segmentation)
        actual_start_index = section.start_index
        
        # Find the actual end index by using feature boundaries (more reliable after segmentation)
        actual_end_index = None
        for i in range(section.start_index, len(lines)):
            if ("; feature" in lines[i] and "; feature outer perimeter" not in lines[i]):
                actual_end_index = i
                break
        
        # If no feature boundary found, try to find coordinates as fallback
        if actual_end_index is None:
            actual_end_index = CoordinateFinder.find_coordinates_near_target(
                lines, section.start_index, len(lines), end_coordinates, tolerance=0.01
            )
            if actual_end_index is not None:
                actual_end_index += 1  # Move past the matching line
        
        if actual_end_index is None:
            actual_end_index = len(lines)
        
        logger.info(f"Found perimeter in segmented lines: {actual_start_index + 1} to {actual_end_index}")
        return actual_start_index, actual_end_index
    
    def _apply_all_adjustments(self, lines: List[str], copied_lines_count: int,
                              actual_start_index: int, actual_end_index: int,
                              split_start_index: Optional[int], section) -> List[str]:
        """Apply all adjustments to the modified lines."""
        lines = self._apply_position_adjustments(lines, split_start_index, actual_start_index)
        lines = self._apply_extrusion_adjustments(lines, copied_lines_count, actual_start_index, actual_end_index)
        lines = self._apply_feedrate_adjustments(lines, actual_start_index, copied_lines_count)
        # lines = self._apply_z_ramping_adjustments(lines, actual_start_index, copied_lines_count, section)
        return lines
    
    def _calculate_total_perimeter_distance(self, lines: List[str], section) -> float:
        """Calculate the total distance of the perimeter by summing all extrusion moves."""
        total_distance = 0.0
        current_position = None
        
        # Find the actual perimeter boundaries in the segmented lines
        actual_start_index = section.start_index
        actual_end_index = None
        
        # Find actual end based on feature boundaries or coordinates
        for i in range(section.start_index, len(lines)):
            if ("; feature" in lines[i] and "; feature outer perimeter" not in lines[i]):
                actual_end_index = i
                break
        
        if actual_end_index is None:
            actual_end_index = len(lines)
        
        # Sum distances of all extrusion moves in the perimeter
        for i in range(actual_start_index, actual_end_index):
            line = lines[i]
            if GCodeParser.is_extrusion_line(line):
                move = GCodeParser.parse_g1_move(line)
                if move:
                    new_position = Point2D(move.x, move.y)
                    if current_position is not None:
                        segment_distance = current_position.distance_to(new_position)
                        total_distance += segment_distance
                    current_position = new_position
        
        logger.info(f"Calculated total perimeter distance: {total_distance:.2f}mm")
        return total_distance
    
    def _find_target_z_value(self, lines: List[str], section) -> Optional[float]:
        """Find the Z value from before the perimeter start point."""
        start_index = section.start_index
        
        # Look backwards from the perimeter start to find the most recent Z coordinate
        for i in range(start_index - 1, -1, -1):
            line = lines[i]
            if line.startswith("G1") and "Z" in line:
                parts = line.strip().split()
                for part in parts:
                    if part.startswith("Z"):
                        try:
                            z_value = float(part[1:])
                            logger.info(f"Found target Z value: {z_value}mm from line {i + 1}")
                            return z_value
                        except ValueError:
                            continue
        
        logger.warning("Could not find target Z value before perimeter start")
        return None
    
    def _apply_z_ramping(self, lines: List[str], actual_start_index: int, 
                        copied_lines_count: int, target_z: float) -> List[str]:
        """
        Apply Z ramping to the copied lines, gradually increasing from z_ramp_start to target_z.
        
        Args:
            lines: List of G-code lines
            actual_start_index: Index where the perimeter section starts
            copied_lines_count: Number of lines that were copied to the front
            target_z: The target Z value to ramp up to
            
        Returns:
            Modified list of lines with Z ramping applied
        """
        logger.info(f"Applying Z ramping from {self.config.z_ramp_start}mm to {target_z}mm over "
                   f"{copied_lines_count} copied lines")
        
        # Find all lines in the copied section (from actual_start_index to copied_lines_count)
        lines_processed = 0
        
        for i in range(actual_start_index, len(lines)):
            line = lines[i]
            
            # Only process G1 lines with coordinates
            if line.startswith("G1") and ("X" in line or "Y" in line):
                # Calculate progress through copied section (0.0 to 1.0)
                progress = lines_processed / max(copied_lines_count - 1, 1)
                
                # Linear interpolation from z_ramp_start to target_z, but never below z_ramp_start
                if target_z >= self.config.z_ramp_start:
                    # Normal ramping up from z_ramp_start to target_z
                    ramped_z = self.config.z_ramp_start + (target_z - self.config.z_ramp_start) * progress
                else:
                    # If target_z is below z_ramp_start, stay at z_ramp_start
                    ramped_z = self.config.z_ramp_start
                
                # Update the line with the ramped Z value
                updated_line = self._update_line_z_value(line, ramped_z)
                if updated_line:
                    lines[i] = updated_line
                    logger.debug(f"Line {i + 1}: Z{ramped_z:.3f} (progress: {progress:.2f})")
                
                lines_processed += 1
                
                # Stop when we've processed all copied lines
                if lines_processed >= copied_lines_count:
                    break
        
        logger.info(f"Z ramping applied to {lines_processed} lines")
        return lines
    
    def _update_line_z_value(self, line: str, new_z: float) -> Optional[str]:
        """Update the Z value in a G-code line, adding it if not present."""
        try:
            parts = line.strip().split()
            new_parts = []
            z_updated = False
            
            for part in parts:
                if part.startswith("Z"):
                    # Replace existing Z value
                    new_parts.append(f"Z{new_z:.3f}")
                    z_updated = True
                else:
                    new_parts.append(part)
            
            # Add Z value if it wasn't already present
            if not z_updated:
                new_parts.append(f"Z{new_z:.3f}")
            
            return " ".join(new_parts) + "\n"
        
        except (ValueError, IndexError):
            logger.warning(f"Failed to update Z value in line: {line.strip()}")
            return None
    
    
    def _find_lines_to_copy(self, lines: List[str], start_index: int, 
                           end_index: int, target_end_coordinates: Point2D, copy_distance: float) -> Tuple[List[str], Optional[int], Optional[int]]:
        """Find the lines to copy based on the copy distance."""
        copy_lines = []
        total_distance = 0.0
        current_position = None
        
        # Find the line that matches the target end coordinates (from detector)
        target_tolerance = 0.01  # 10 micron tolerance for coordinate matching
        ending_line_index = CoordinateFinder.find_coordinates_near_target(
            lines, start_index, end_index, target_end_coordinates, target_tolerance
        )
        
        if ending_line_index is not None:
            # Get the exact position from the found line
            line = lines[ending_line_index]
            move = GCodeParser.parse_g1_move(line)
            if move:
                current_position = Point2D(move.x, move.y)
                logger.info(f"Found target ending position: {current_position} at line {ending_line_index+1}")
            else:
                current_position = None
        
        # Fallback: if we can't find exact coordinates, use the last extrusion line
        if current_position is None:
            logger.warning(f"Could not find line matching target coordinates {target_end_coordinates}, using fallback")
            for i in range(end_index - 1, start_index - 1, -1):
                line = lines[i]
                if GCodeParser.is_extrusion_line(line):
                    move = GCodeParser.parse_g1_move(line)
                    if move:
                        current_position = Point2D(move.x, move.y)
                        ending_line_index = i
                        logger.info(f"Fallback ending position: {current_position} at line {i+1}")
                        break
        
        if current_position is None:
            return [], None, None
        
        # Work backwards to collect lines, starting from the actual ending position
        split_start_index = None  # First line of copied section
        split_end_index = None    # Last line of copied section
        
        # Start from the ending line we found, not the section boundary
        start_search_index = ending_line_index if ending_line_index is not None else end_index - 1
        
        for i in range(start_search_index, start_index - 1, -1):
            line = lines[i]
            if GCodeParser.is_extrusion_line(line):
                move = GCodeParser.parse_g1_move(line)
                if move:
                    new_position = Point2D(move.x, move.y)
                    distance = current_position.distance_to(new_position)
                    
                    if total_distance + distance <= copy_distance:
                        copy_lines.insert(0, line)
                        total_distance += distance
                        current_position = new_position
                        
                        # Track the range of copied section
                        if split_end_index is None:
                            split_end_index = i  # Last line included (closest to end)
                        split_start_index = i     # First line included (furthest from end)
                    else:
                        break
        
        logger.info(f"Collected {total_distance:.2f}mm of lines to copy")
        logger.info(f"Split range: lines {split_start_index + 1} to {split_end_index + 1}")
        return copy_lines, split_start_index, split_end_index
    
    def _create_modified_structure(self, lines: List[str], start_index: int, 
                                  end_index: int, copy_lines: List[str],
                                  split_start_index: Optional[int], split_end_index: Optional[int]) -> List[str]:
        """Create the modified line structure with copied section at front."""
        new_lines = lines[:start_index]  # Everything before outer perimeter

        new_lines.append("; ###### PERIMETER ECHO START\n")

        # Add the copied section at the front
        new_lines.extend(copy_lines)
        
        # Add comment marking the original start point
        new_lines.append("; === Original start Point ===\n")
        
        # Add the original section up to the split start
        if split_start_index is not None and split_end_index is not None:
            # Add original perimeter from start up to where copying started
            new_lines.extend(lines[start_index:split_start_index])
            
            # Add comment marking where the split/copying began
            new_lines.append("; === Split Start ===\n")
            
            # Add the copied section in its original position (this creates the duplication)
            new_lines.extend(lines[split_start_index:split_end_index + 1])
            
            # Add comment marking where the copying ended
            new_lines.append("; === Split End ===\n")
            
            # Continue from where the copied section ended
            new_lines.extend(lines[split_end_index + 1:end_index])
        else:
            # Fallback: add all original lines (no copying occurred)
            new_lines.extend(lines[start_index:end_index])
        
        new_lines.append("; ###### PERIMETER ECHO END\n")

        # Add the rest of the file
        new_lines.extend(lines[end_index:])

        return new_lines
    
    def _apply_position_adjustments(self, lines: List[str], split_point_index: Optional[int],
                                   actual_start_index: int) -> List[str]:
        """Apply position adjustments for pre-perimeter movement."""
        if split_point_index is None:
            return lines
        
        # Find coordinates from line before split point
        split_coordinates = self._find_split_coordinates(lines)
        if split_coordinates is None:
            return lines
        
        # Update pre-perimeter position
        return self._update_pre_perimeter_position(lines, split_coordinates, actual_start_index)
    
    def _find_split_coordinates(self, lines: List[str]) -> Optional[Point2D]:
        """Find the coordinates from the line just before the copied section started (e.g., line 144)."""
        # Find the split start comment
        split_start_comment_index = None
        for i, line in enumerate(lines):
            if "; === Split Start ===" in line:
                split_start_comment_index = i
                break
        
        if split_start_comment_index is None:
            logger.warning("Could not find split start comment")
            return None
        
        # Get coordinates from the last extrusion line just before the split start comment
        # This represents the line just before the copied section began (e.g., line 144 in our example)
        # The travel move should be updated to these coordinates for smooth continuation
        for i in range(split_start_comment_index - 1, -1, -1):
            line = lines[i]
            if GCodeParser.is_extrusion_line(line):
                move = GCodeParser.parse_g1_move(line)
                if move:
                    logger.info(f"Found travel move coordinates from line {i+1} (just before copied section): {move.x:.3f}, {move.y:.3f}")
                    return Point2D(move.x, move.y)
        
        logger.warning("Could not find extrusion line before copied section")
        return None
    
    def _update_pre_perimeter_position(self, lines: List[str], split_coords: Point2D,
                                      actual_start_index: int) -> List[str]:
        """Update the pre-perimeter movement command."""
        # Find the last movement command before the outer perimeter
        for i in range(actual_start_index - 1, -1, -1):
            line = lines[i]
            if (line.startswith("G1") and "X" in line and "Y" in line and 
                ("F" in line or "Z" not in line)):
                
                # Parse original line to preserve F parameter
                original_move = GCodeParser.parse_g1_move(line)
                if original_move:
                    # Create new line with split coordinates
                    new_line = f"G1 X{split_coords.x:.3f} Y{split_coords.y:.3f}"
                    if original_move.f is not None:
                        new_line += f" F{original_move.f}"
                    new_line += "\n"
                    
                    logger.info(f"Updating pre-perimeter position to {split_coords}")
                    lines[i] = new_line
                break
        
        return lines
    
    def _apply_extrusion_adjustments(self, lines: List[str], copied_lines_count: int,
                                    actual_start_index: int, actual_end_index: int) -> List[str]:
        """Apply extrusion adjustments using the GradientExtrusionAdjuster."""
        adjuster = GradientExtrusionAdjuster(self.config)
        return adjuster.apply_linear_adjustments(
            lines, copied_lines_count, actual_start_index, None, actual_end_index
        )
    
    def _apply_feedrate_adjustments(self, lines: List[str], actual_start_index: int, copied_lines_count: int) -> List[str]:
        """Apply feedrate adjustments using the GradientFeedrateAdjuster."""
        adjuster = GradientFeedrateAdjuster(self.config)
        return adjuster.blend_feedrate_over_copied_lines(lines, actual_start_index, copied_lines_count)
    
    def _apply_z_ramping_adjustments(self, lines: List[str], actual_start_index: int, 
                                    copied_lines_count: int, section) -> List[str]:
        """Apply Z ramping to the copied lines."""
        # Find the target Z value from before the perimeter start
        target_z = self._find_target_z_value(lines, section)
        if target_z is None:
            logger.warning("Skipping Z ramping - could not find target Z value")
            return lines
        
        # Apply Z ramping
        return self._apply_z_ramping(lines, actual_start_index, copied_lines_count, target_z)


class GCodeSegmentationProcessor:
    """Main processor for Gradient Perimeter Echo and modification operations."""
    
    def __init__(self, config: Optional[GradientPerimeterEchoConfig] = None):
        self.config = config or GradientPerimeterEchoConfig()
        self.config.validate()
        
        self.perimeter_detector = PerimeterDetector(self.config)
        self.line_segmenter = GradientLineSegmenter(self.config)
        self.ending_copier = EndingCopier(self.config)
    
    def process_gcode(self, gcode_content: str) -> SegmentationResult:
        """
        Process G-code content with gradient perimeter echo and modifications.
        
        Args:
            gcode_content: Original G-code content
            
        Returns:
            SegmentationResult with processing details
        """
        try:
            lines = gcode_content.splitlines(keepends=True)
            original_line_count = len(lines)
            
            logger.info(f"Processing G-code with {original_line_count} lines")
            
            # Find outer perimeter section
            section = self.perimeter_detector.find_outer_perimeter_section(lines)
            if section is None:
                return SegmentationResult(
                    success=False,
                    processed_content=gcode_content,
                    original_lines=original_line_count,
                    processed_lines=original_line_count,
                    error_message="Could not find outer perimeter section"
                )
            
            # Segment long lines
            segmented_lines = self.line_segmenter.segment_perimeter_lines(lines, section)
            
            # Copy ending to front if enabled
            if self.config.copy_ending_percentage > 0:
                segmented_lines = self.ending_copier.copy_ending_to_front(
                    segmented_lines, section, section.end_coordinates
                )
            
            processed_content = ''.join(segmented_lines)
            processed_line_count = len(segmented_lines)
            
            logger.info(f"Processing complete: {original_line_count} -> {processed_line_count} lines")
            
            return SegmentationResult(
                success=True,
                processed_content=processed_content,
                original_lines=original_line_count,
                processed_lines=processed_line_count,
                segments_created=processed_line_count - original_line_count
            )
            
        except Exception as e:
            logger.error(f"Error processing G-code: {e}")
            return SegmentationResult(
                success=False,
                processed_content=gcode_content,
                original_lines=len(gcode_content.splitlines()),
                processed_lines=len(gcode_content.splitlines()),
                error_message=str(e)
            )

