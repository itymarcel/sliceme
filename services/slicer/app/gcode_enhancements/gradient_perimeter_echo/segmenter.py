"""
Line segmentation functionality for Gradient Perimeter Echo processing.

This module handles splitting long G-code lines into smaller segments
and managing extrusion calculations during gradient echo processing.
"""

import logging
import math
from typing import List, Optional, Tuple

from .models import Point2D, PerimeterSection, GradientPerimeterEchoConfig, ExtrusionMode, GCodeMove
from .parser import GCodeParser
from .utils import CoordinateFinder

logger = logging.getLogger(__name__)


class GradientLineSegmenter:
    """Handles segmentation of long G-code lines for gradient perimeter echo."""
    
    def __init__(self, config: GradientPerimeterEchoConfig):
        self.config = config
    
    def segment_perimeter_lines(self, lines: List[str], section: PerimeterSection) -> List[str]:
        """
        Segment long lines in the outer perimeter section.
        
        Args:
            lines: Original G-code lines
            section: PerimeterSection defining the area to segment
            
        Returns:
            List of lines with long segments split
        """
        logger.info("Starting line segmentation")
        
        new_lines = lines[:section.start_index]
        
        # Get initial state - use pre-extrusion travel coordinates for proper first line segmentation
        current_position = self._find_pre_extrusion_position(lines, section.start_index, section.start_coordinates)
        extrusion_mode = GCodeParser.find_extrusion_mode(lines, section.start_index)
        current_e = self._find_current_extrusion(lines, section.start_index)
        
        segments_created = 0
        
        # Process each line in the perimeter section
        for i in range(section.start_index, section.end_index):
            line = lines[i]
            
            if not (line.startswith("G1") and "X" in line and "Y" in line):
                new_lines.append(line)
                continue
            
            move = GCodeParser.parse_g1_move(line)
            if move is None:
                new_lines.append(line)
                continue
            
            new_position = Point2D(move.x, move.y)
            
            if not move.has_extrusion:
                # Travel move, keep as is
                new_lines.append(line)
                current_position = new_position
                continue
            
            # Check if line needs segmentation
            distance = current_position.distance_to(new_position)
            
            if distance <= self.config.max_segment_length:
                new_lines.append(line)
                current_position = new_position
                current_e = self._update_extrusion(current_e, move.e, extrusion_mode)
            else:
                # Segment the line
                segmented_lines = self._create_segments(
                    current_position, new_position, move, current_e, 
                    extrusion_mode, distance
                )
                new_lines.extend(segmented_lines)
                segments_created += len(segmented_lines) - 1  # -1 because original would be 1 line
                current_position = new_position
                current_e = self._update_extrusion(current_e, move.e, extrusion_mode)
        
        # Add remaining lines
        new_lines.extend(lines[section.end_index:])
        
        logger.info(f"Line segmentation complete. Created {segments_created} additional segments")
        return new_lines
    
    def _find_current_extrusion(self, lines: List[str], before_index: int) -> float:
        """Find the current extrusion value before the given index."""
        for i in range(before_index - 1, -1, -1):
            line = lines[i]
            if line.startswith("G1") and "E" in line:
                move = GCodeParser.parse_g1_move(line)
                if move and move.e is not None:
                    return move.e
        return 0.0
    
    def _find_pre_extrusion_position(self, lines: List[str], start_index: int, 
                                   first_extrusion_coords: Point2D) -> Point2D:
        """Find the position before the first extrusion for proper distance calculation."""
        pre_extrusion_point = CoordinateFinder.find_pre_extrusion_coordinates(
            lines, start_index, first_extrusion_coords, max_distance=float('inf')
        )
        
        if pre_extrusion_point:
            logger.debug(f"Found pre-extrusion travel position: {pre_extrusion_point}")
            return pre_extrusion_point
        
        # Fallback: return first extrusion coordinates if no travel move found
        logger.debug(f"No pre-extrusion travel move found, using first extrusion coordinates")
        return first_extrusion_coords
    
    def _update_extrusion(self, current_e: float, new_e: Optional[float], 
                         mode: ExtrusionMode) -> float:
        """Update the current extrusion value based on the mode."""
        if new_e is None:
            return current_e
        
        if mode == ExtrusionMode.ABSOLUTE:
            return new_e
        else:  # RELATIVE
            return current_e + new_e
    
    def _create_segments(self, start_pos: Point2D, end_pos: Point2D, 
                        original_move: GCodeMove, current_e: float,
                        extrusion_mode: ExtrusionMode, total_distance: float) -> List[str]:
        """Create segmented lines for a long move."""
        num_segments = math.ceil(total_distance / self.config.max_segment_length)
        logger.debug(f"Splitting line: {total_distance:.3f}mm -> {num_segments} segments")
        
        segments = []
        
        for seg in range(num_segments):
            t = (seg + 1) / num_segments
            
            # Interpolate position
            seg_x = start_pos.x + (end_pos.x - start_pos.x) * t
            seg_y = start_pos.y + (end_pos.y - start_pos.y) * t
            
            # Handle extrusion
            seg_e = None
            if original_move.e is not None:
                if extrusion_mode == ExtrusionMode.ABSOLUTE:
                    seg_e = current_e + (original_move.e - current_e) * t
                else:
                    seg_e = original_move.e / num_segments
            
            # Create the segmented move
            segmented_move = GCodeMove(x=seg_x, y=seg_y, e=seg_e, f=original_move.f)
            segments.append(GCodeParser.build_g1_line(segmented_move))
        
        return segments


class GradientExtrusionAdjuster:
    """Handles extrusion adjustments for gradient perimeter echo effects."""
    
    def __init__(self, config: GradientPerimeterEchoConfig):
        self.config = config
    
    def apply_linear_adjustments(self, lines: List[str], copied_section_length: int,
                                original_start_index: int, split_point_index: int,
                                actual_end_index: int) -> List[str]:
        """
        Apply linear extrusion adjustments to the first (copied) and last sections.
        
        Args:
            lines: List of G-code lines
            copied_section_length: Number of lines in the copied section
            original_start_index: Index where original section starts
            split_point_index: Index where the copied section starts in original
            actual_end_index: Index where the perimeter ends
            
        Returns:
            Modified list of lines with adjusted extrusion values
        """
        logger.info("Applying linear extrusion adjustments")
        logger.info(f"First section: {self.config.first_section_start_multiplier*100:.0f}% → "
                   f"{self.config.first_section_end_multiplier*100:.0f}%")
        logger.info(f"Last section: {self.config.last_section_start_multiplier*100:.0f}% → "
                   f"{self.config.last_section_end_multiplier*100:.0f}%")
        
        # Apply adjustments to first section (copied ending)
        first_section_start = original_start_index
        first_section_end = first_section_start + copied_section_length
        
        lines = self._adjust_section_extrusion(
            lines, first_section_start, first_section_end,
            self.config.first_section_start_multiplier,
            self.config.first_section_end_multiplier
        )
        
        # Find and adjust last section (between Split Start and Split End)
        split_start_index, split_end_index = self._find_split_markers(lines)
        if split_start_index is not None and split_end_index is not None:
            # Adjust the duplicated section in its original position
            lines = self._adjust_section_extrusion(
                lines, split_start_index + 1, split_end_index,
                self.config.last_section_start_multiplier,
                self.config.last_section_end_multiplier
            )
        
        logger.info("Extrusion adjustments applied successfully")
        return lines
    
    def _find_split_markers(self, lines: List[str]) -> Tuple[Optional[int], Optional[int]]:
        """Find the split start and split end markers in the lines."""
        split_start_index = None
        split_end_index = None
        
        for i, line in enumerate(lines):
            if "; === Split Start ===" in line:
                split_start_index = i
            elif "; === Split End ===" in line:
                split_end_index = i
        
        return split_start_index, split_end_index
    
    def _adjust_section_extrusion(self, lines: List[str], start_index: int, 
                                 end_index: int, start_multiplier: float,
                                 end_multiplier: float) -> List[str]:
        """Apply linear extrusion adjustment to a section of lines."""
        # Count extrusion lines in section
        extrusion_lines = []
        for i in range(start_index, min(end_index, len(lines))):
            if GCodeParser.is_extrusion_line(lines[i]):
                extrusion_lines.append(i)
        
        if not extrusion_lines:
            return lines
        
        # Apply adjustments
        for idx, line_index in enumerate(extrusion_lines):
            # Calculate progress through section (0.0 to 1.0)
            progress = idx / max(len(extrusion_lines) - 1, 1)
            
            # Linear interpolation from start to end multiplier
            multiplier = start_multiplier + (end_multiplier - start_multiplier) * progress
            
            # Apply the adjustment
            adjusted_line = GCodeParser.adjust_extrusion_in_line(lines[line_index], multiplier)
            if adjusted_line:
                lines[line_index] = adjusted_line
        
        return lines


class GradientFeedrateAdjuster:
    """Handles feedrate adjustments for gradient perimeter echo blending."""
    
    def __init__(self, config: GradientPerimeterEchoConfig):
        self.config = config
    
    def blend_feedrate_over_copied_lines(self, lines: List[str], 
                                        actual_start_index: int,
                                        copied_lines_count: int) -> List[str]:
        """
        Blend feedrate from starting value to original feedrate over copied lines.
        
        Args:
            lines: List of G-code lines
            actual_start_index: Index where the outer perimeter section starts
            copied_lines_count: Number of lines that were copied to the front
            
        Returns:
            Modified list of lines with blended feedrates
        """
        logger.info(f"Blending feedrate from F{self.config.starting_feedrate} over "
                   f"{copied_lines_count} copied lines")
        
        # Find the original target feedrate
        original_feedrate = self._find_original_feedrate(lines)
        if original_feedrate is None:
            logger.warning("Could not find original first extrusion feedrate")
            return lines
        
        logger.info(f"Target feedrate: F{original_feedrate}")
        
        # Find extrusion lines in the copied section (from start to copied_lines_count)
        extrusion_lines = []
        for i in range(actual_start_index, len(lines)):
            line = lines[i]
            if GCodeParser.is_extrusion_line(line):
                extrusion_lines.append(i)
                if len(extrusion_lines) >= copied_lines_count:
                    break
        
        if not extrusion_lines:
            logger.warning("No extrusion lines found for feedrate blending")
            return lines
        
        # Apply blended feedrates over the copied extrusion lines
        blend_count = min(len(extrusion_lines), copied_lines_count)
        
        for i, line_index in enumerate(extrusion_lines[:blend_count]):
            # Calculate blend progress (0.0 to 1.0)
            progress = i / max(blend_count - 1, 1)
            
            # Linear interpolation from starting_feedrate to original_feedrate
            blended_feedrate = int(
                self.config.starting_feedrate + 
                (original_feedrate - self.config.starting_feedrate) * progress
            )
            
            # Update the line
            updated_line = self._update_line_feedrate(lines[line_index], blended_feedrate)
            if updated_line:
                lines[line_index] = updated_line
                logger.info(f"Line {line_index + 1}: F{blended_feedrate} (progress: {progress:.2f})")
        
        logger.info(f"Feedrate blending completed over {blend_count} lines")
        return lines
    
    
    def _find_original_feedrate(self, lines: List[str]) -> Optional[int]:
        """Find the original first extrusion feedrate from the original start point."""
        # Find the "Original start Point" comment
        original_start_index = None
        for i, line in enumerate(lines):
            if "; === Original start Point ===" in line:
                original_start_index = i
                break
        
        if original_start_index is None:
            return None
        
        # Find the first extrusion line after the comment with feedrate
        for i in range(original_start_index + 1, len(lines)):
            line = lines[i]
            if GCodeParser.is_extrusion_line(line) and "F" in line:
                parts = line.split()
                for part in parts:
                    if part.startswith("F"):
                        try:
                            return int(part[1:])
                        except ValueError:
                            continue
        
        return None
    
    def _update_line_feedrate(self, line: str, new_feedrate: int) -> Optional[str]:
        """Update the feedrate in a G-code line."""
        try:
            parts = line.strip().split()
            new_parts = []
            feedrate_found = False
            
            for part in parts:
                if part.startswith("F"):
                    # Replace existing feedrate
                    new_parts.append(f"F{new_feedrate}")
                    feedrate_found = True
                else:
                    new_parts.append(part)
            
            # Add feedrate if it wasn't already present
            if not feedrate_found:
                new_parts.append(f"F{new_feedrate}")
            
            return " ".join(new_parts) + "\n"
        
        except (ValueError, IndexError):
            logger.warning(f"Failed to update feedrate in line: {line.strip()}")
            return None

