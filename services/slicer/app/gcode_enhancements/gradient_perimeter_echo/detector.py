"""
Perimeter detection and loop closure analysis for Gradient Perimeter Echo.

This module handles finding outer perimeter sections and detecting
geometric loop closures in G-code files for gradient echo processing.
"""

import logging
from typing import List, Optional, Tuple

from .models import Point2D, PerimeterSection, GradientPerimeterEchoConfig
from .parser import GCodeParser
from .utils import CoordinateFinder

logger = logging.getLogger(__name__)


class PerimeterDetector:
    """Handles detection and analysis of outer perimeter sections."""
    
    def __init__(self, config: GradientPerimeterEchoConfig):
        self.config = config
    
    def find_outer_perimeter_section(self, lines: List[str]) -> Optional[PerimeterSection]:
        """
        Find the outer perimeter section in the G-code.
        
        Args:
            lines: List of G-code lines
            
        Returns:
            PerimeterSection object or None if not found
        """
        start_index = self._find_perimeter_start(lines)
        if start_index is None:
            logger.warning("Could not find start of outer perimeter")
            return None
        
        end_result = self._find_perimeter_end(lines, start_index)
        if end_result is None:
            logger.warning("Could not find end of outer perimeter")
            return None
        
        end_index, end_coordinates = end_result
        
        # Get start coordinates
        start_move = GCodeParser.parse_g1_move(lines[start_index])
        if start_move is None:
            logger.warning("Could not parse start coordinates")
            return None
        
        start_coordinates = Point2D(start_move.x, start_move.y)
        
        logger.info(f"Found outer perimeter section: lines {start_index + 1} to {end_index}")
        
        return PerimeterSection(
            start_index=start_index,
            end_index=end_index,
            start_coordinates=start_coordinates,
            end_coordinates=end_coordinates
        )
    
    def _find_perimeter_start(self, lines: List[str]) -> Optional[int]:
        """Find the first extrusion move using primary method or fallback to comment-based detection."""
        # Primary method: Find first block of 20+ consecutive extrusions or 150mm+ travel distance
        result = self._find_extrusion_block_start(lines)
        if result is not None:
            logger.info(f"Found perimeter start using extrusion block method at line {result + 1}")
            return result
        
        
        return None
    
    def _find_extrusion_block_start(self, lines: List[str]) -> Optional[int]:
        """
        Find the first block of consecutive extrusion lines.
        
        Returns the index of the first extrusion in a block that either:
        1. Has at least 20 consecutive extrusion lines, OR
        2. Has consecutive extrusions that travel a total distance > 150mm
        
        Args:
            lines: List of G-code lines
            
        Returns:
            Index of first extrusion in qualifying block, or None if not found
        """
        min_consecutive_extrusions = 20
        min_travel_distance = 150.0
        
        i = 0
        while i < len(lines):
            # Skip comments and non-G1 lines
            if not lines[i].startswith("G1"):
                i += 1
                continue
            
            # Check if this is a valid extrusion line
            if not self._is_valid_extrusion_line(lines[i]):
                i += 1
                continue
            
            # Found potential start of extrusion block
            block_start = i
            consecutive_count = 0
            total_distance = 0.0
            prev_point = None
            
            # Parse the first extrusion to get starting coordinates
            first_move = GCodeParser.parse_g1_move(lines[i])
            if first_move is None:
                i += 1
                continue
            
            prev_point = Point2D(first_move.x, first_move.y)
            consecutive_count = 1
            
            # Continue counting consecutive extrusions
            j = i + 1
            while j < len(lines):
                line = lines[j]

                # Break on feature boundary comments (new wall/section starting)
                if line.strip().startswith(";"):
                    stripped = line.strip().lower()
                    if any(marker in stripped for marker in [
                        "; feature inner", "; feature solid", "; feature infill",
                        ";type:wall-inner", ";type:skin", ";type:fill",
                        "; inner wall", "; sparse infill", "; solid infill",
                        "; layer ", "layer ",
                    ]):
                        break
                    # Non-boundary comments: skip and continue
                    j += 1
                    continue

                # If not a G1 line, break the consecutive sequence
                if not line.startswith("G1"):
                    break
                
                # Check if this is a valid extrusion line
                if not self._is_valid_extrusion_line(line):
                    break
                
                # Parse the move and calculate distance
                move = GCodeParser.parse_g1_move(line)
                if move is None:
                    break
                
                current_point = Point2D(move.x, move.y)
                segment_distance = prev_point.distance_to(current_point)
                total_distance += segment_distance
                consecutive_count += 1
                prev_point = current_point
                
                # Check if we've met either criteria
                if (consecutive_count >= min_consecutive_extrusions or 
                    total_distance >= min_travel_distance):
                    logger.info(f"Found qualifying extrusion block: {consecutive_count} lines, "
                              f"{total_distance:.2f}mm travel distance")
                    return block_start
                
                j += 1
            
            # Move to next potential start point
            i += 1
        
        return None
    
    def _is_valid_extrusion_line(self, line: str) -> bool:
        """
        Check if a line is a valid extrusion line.
        
        Must be a G1 move with E parameter AND at least one coordinate (X, Y, or Z).
        """
        if not line.startswith("G1"):
            return False
        
        has_e = "E" in line
        has_coordinate = any(coord in line for coord in ["X", "Y", "Z"])
        
        return has_e and has_coordinate
    
    def _find_perimeter_end(self, lines: List[str], start_index: int) -> Optional[Tuple[int, Point2D]]:
        """Find the end of the outer perimeter using geometric loop closure detection."""
        logger.info(f"Searching for geometric loop closure (tolerance: {self.config.loop_closure_tolerance}mm)")
        
        # Check for override comment first
        override_result = self._check_for_override(lines, start_index)
        if override_result:
            return override_result
        
        # Get starting position
        start_move = GCodeParser.parse_g1_move(lines[start_index])
        if start_move is None:
            logger.warning("Could not parse starting position")
            return None
        
        start_point = Point2D(start_move.x, start_move.y)
        logger.info(f"First extrusion position: {start_point}")
        
        # Try geometric closure using first extrusion coordinates
        result = self._try_geometric_closure(lines, start_index, start_point)
        if result:
            logger.info("Found closure using first extrusion coordinates")
            return result
        
        # Try using pre-extrusion travel coordinates
        pre_travel_point = self._find_pre_extrusion_coordinates(lines, start_index, start_point)
        if pre_travel_point:
            distance = start_point.distance_to(pre_travel_point)
            logger.info(f"Pre-extrusion travel position: {pre_travel_point} (distance: {distance:.3f}mm)")
            
            result = self._try_geometric_closure(lines, start_index, pre_travel_point)
            if result:
                logger.info("Found closure using pre-extrusion travel coordinates")
                return result
            else:
                logger.warning("No closure found using pre-extrusion travel coordinates")
        else:
            logger.warning("No suitable pre-extrusion travel coordinates found")
        
        # Special case: if no closure found, check if the outer perimeter extends to the end
        # This handles cases where the entire layer is outer perimeter
        end_result = self._check_for_end_of_layer_perimeter(lines, start_index, start_point)
        if end_result:
            logger.info("Using end-of-layer perimeter detection")
            return end_result
        
        logger.warning("No geometric closure found with either method")
        return None
    
    def _check_for_override(self, lines: List[str], start_index: int) -> Optional[Tuple[int, Point2D]]:
        """Check for end point override comment."""
        for i in range(start_index + 1, len(lines)):
            if "; end point override" in lines[i]:
                logger.info(f"Found end point override comment at line {i + 1}")
                
                # Find the last extrusion move before this comment
                for j in range(i - 1, start_index, -1):
                    if lines[j].startswith("G1") and "E" in lines[j]:
                        logger.info(f"Using override end point at line {j + 1}")
                        override_move = GCodeParser.parse_g1_move(lines[j])
                        if override_move:
                            end_point = Point2D(override_move.x, override_move.y)
                            return j + 1, end_point
                break
        
        return None
    
    def _find_pre_extrusion_coordinates(self, lines: List[str], start_index: int, 
                                       first_extrusion_point: Point2D) -> Optional[Point2D]:
        """Find the last known X,Y coordinates from travel moves before the first extrusion."""
        pre_extrusion_point = CoordinateFinder.find_pre_extrusion_coordinates(
            lines, start_index, first_extrusion_point, self.config.max_pre_travel_distance
        )
        
        if pre_extrusion_point:
            return pre_extrusion_point
        
        # If standard search failed, try with relaxed distance for perfect closure detection
        relaxed_point = CoordinateFinder.find_pre_extrusion_coordinates(
            lines, start_index, first_extrusion_point, float('inf')
        )
        
        if relaxed_point:
            distance = relaxed_point.distance_to(first_extrusion_point)
            logger.info(f"Pre-extrusion travel distance ({distance:.3f}mm) exceeds limit "
                       f"({self.config.max_pre_travel_distance}mm), checking for perfect closure")
            
            # Try closure detection with this point
            result = self._try_geometric_closure(lines, start_index, relaxed_point)
            if result:
                end_index, end_point = result
                # Check if closure is very close (the end point should match pre-extrusion coordinates)
                closure_distance = relaxed_point.distance_to(end_point)
                logger.info(f"Geometric closure check: pre-extrusion {relaxed_point} vs end point {end_point} = {closure_distance:.3f}mm distance")
                if closure_distance < 2.1:  # Close enough closure (allows for small travel moves after perimeter)
                    logger.info(f"Found perfect geometric closure ({closure_distance:.3f}mm), "
                               f"accepting large travel distance")
                    return relaxed_point
                else:
                    logger.info(f"Geometric closure not close enough ({closure_distance:.3f}mm)")
            else:
                logger.info("No geometric closure found")
        
        return None
    
    def _try_geometric_closure(self, lines: List[str], start_index: int, 
                              start_point: Point2D) -> Optional[Tuple[int, Point2D]]:
        """Try to find geometric closure using the given start coordinates."""
        closure_detector = ClosureDetector(self.config, start_point)
        return closure_detector.find_closure(lines, start_index)
    
    def _check_for_end_of_layer_perimeter(self, lines: List[str], start_index: int, 
                                         start_point: Point2D) -> Optional[Tuple[int, Point2D]]:
        """Check if the perimeter extends to the end of the layer without geometric closure."""
        boundary_markers = [
            "; layer ", "layer ", "; process ", "; layer end"
        ]
        
        last_extrusion_index = None
        last_extrusion_point = None
        
        # Find the last extrusion move before layer boundary
        for i in range(start_index + 1, len(lines)):
            line = lines[i]
            line_lower = line.lower()
            
            # Check for layer boundary
            if any(marker in line_lower for marker in boundary_markers):
                break
            
            # Track extrusion moves
            if line.startswith("G1") and "E" in line:
                move = GCodeParser.parse_g1_move(line)
                if move:
                    last_extrusion_index = i
                    last_extrusion_point = Point2D(move.x, move.y)
        
        if last_extrusion_index and last_extrusion_point:
            logger.info(f"Using end-of-layer perimeter: line {last_extrusion_index + 1}")
            return last_extrusion_index, last_extrusion_point
        
        return None


class ClosureDetector:
    """Handles the detection of geometric loop closure."""
    
    def __init__(self, config: GradientPerimeterEchoConfig, start_point: Point2D):
        self.config = config
        self.start_point = start_point
        self.min_distance_to_check = 3.0
        self.total_distance_traveled = 0.0
        self.best_match_index = None
        self.best_distance = float('inf')
        self.in_closing_sequence = False
        self.last_distance = float('inf')
    
    def find_closure(self, lines: List[str], start_index: int) -> Optional[Tuple[int, Point2D]]:
        """Find the closure point for the perimeter loop."""
        max_search_index = self._find_search_boundary(lines, start_index)
        prev_point = self.start_point
        
        for i in range(start_index + 1, max_search_index):
            line = lines[i]
            
            if not self._is_relevant_move(line):
                continue
            
            move = GCodeParser.parse_g1_move(line)
            if move is None:
                continue
            
            current_point = Point2D(move.x, move.y)
            
            # Update distance tracking
            segment_distance = prev_point.distance_to(current_point)
            self.total_distance_traveled += segment_distance
            
            # Only check for closure after minimum distance
            if self.total_distance_traveled < self.min_distance_to_check:
                prev_point = current_point
                continue
            
            # Check for closure
            if self._process_closure_candidate(i, current_point, lines, start_index):
                # Check if the best match is an extrusion line, if not find the last extrusion within 3mm
                final_index, final_point = self._find_final_extrusion_point(lines, self.best_match_index)
                if final_index is not None and final_point is not None:
                    return final_index + 1, final_point
                return self.best_match_index + 1, current_point
            
            prev_point = current_point
        
        # Check final closure if we're in a closing sequence
        if self.in_closing_sequence and self.best_match_index is not None:
            if self._validate_closure_direction(lines, start_index, self.best_match_index):
                # Check if the best match is an extrusion line, if not find the last extrusion within 3mm
                final_index, final_point = self._find_final_extrusion_point(lines, self.best_match_index)
                if final_index is not None and final_point is not None:
                    return final_index + 1, final_point
        
        return None
    
    def _find_search_boundary(self, lines: List[str], start_index: int) -> int:
        """Find the boundary for search scope to avoid jumping to next layer."""
        boundary_markers = [
            # PrusaSlicer / SuperSlicer
            "; feature inner perimeter", "; feature solid layer", "; feature infill",
            "; layer ", "layer ", "; process ", "m221 s100", "; layer end",
            # Cura
            ";type:wall-inner", ";type:skin", ";type:fill", ";type:support",
            # Bambu Studio / OrcaSlicer
            "; inner wall", "; sparse infill", "; solid infill", "; bridge infill",
        ]
        
        for i in range(start_index + 1, len(lines)):
            line_lower = lines[i].lower()
            
            if any(marker in line_lower for marker in boundary_markers):
                logger.info(f"Limited search scope to line {i} (found: {lines[i].strip()})")
                return i
            
            # Check for Z moves without extrusion
            if (line_lower.startswith("g1") and "z" in line_lower and 
                "f" in line_lower and "e" not in line_lower):
                logger.info(f"Limited search scope to line {i} (found Z move)")
                return i
        
        return len(lines)
    
    def _is_relevant_move(self, line: str) -> bool:
        """Check if the line is a relevant movement for closure detection."""
        return (line.startswith("G1") and 
                (("E" in line) or ("X" in line and "Y" in line and "E" not in line)))
    
    def _process_closure_candidate(self, line_index: int, current_point: Point2D, 
                                  lines: List[str], start_index: int) -> bool:
        """Process a potential closure candidate point."""
        distance_to_start = current_point.distance_to(self.start_point)
        
        if distance_to_start <= self.config.loop_closure_tolerance:
            if distance_to_start < self.last_distance:
                if not self.in_closing_sequence:
                    logger.info(f"Starting closure sequence at line {line_index + 1} "
                              f"(distance: {distance_to_start:.3f}mm)")
                    self.in_closing_sequence = True
                
                if distance_to_start < self.best_distance:
                    self.best_distance = distance_to_start
                    self.best_match_index = line_index
                    logger.info(f"New best match at line {line_index + 1} "
                              f"(distance: {distance_to_start:.3f}mm)")
            
            elif self.in_closing_sequence:
                return self._finalize_closure(lines, start_index)
        
        elif self.in_closing_sequence:
            return self._finalize_closure(lines, start_index)
        
        self.last_distance = distance_to_start
        return False
    
    def _finalize_closure(self, lines: List[str], start_index: int) -> bool:
        """Finalize the closure detection process."""
        logger.info(f"End of closing sequence. Best match: line {self.best_match_index + 1} "
                   f"(distance: {self.best_distance:.3f}mm)")
        
        if self._validate_closure_direction(lines, start_index, self.best_match_index):
            return True
        else:
            logger.warning("Closure direction validation failed, continuing search...")
            self._reset_closure_state()
            return False
    
    def _reset_closure_state(self):
        """Reset the closure detection state."""
        self.in_closing_sequence = False
        self.best_match_index = None
        self.best_distance = float('inf')
    
    def _validate_closure_direction(self, lines: List[str], start_index: int, 
                                   end_index: int) -> bool:
        """Validate that the closure point approaches the start from a reasonable direction."""
        if end_index is None or end_index <= start_index:
            return False
        
        approach_points = []
        for i in range(max(start_index + 1, end_index - 5), end_index + 1):
            if i < len(lines):
                move = GCodeParser.parse_g1_move(lines[i])
                if move and lines[i].startswith("G1") and "E" in lines[i]:
                    approach_points.append(Point2D(move.x, move.y))
        
        if len(approach_points) < 2:
            return True  # Not enough points to validate
        
        # Calculate approach vector and validation
        approach_vector = (
            approach_points[-1].x - approach_points[-2].x,
            approach_points[-1].y - approach_points[-2].y
        )
        
        end_to_start_vector = (
            self.start_point.x - approach_points[-1].x,
            self.start_point.y - approach_points[-1].y
        )
        
        # Calculate cosine similarity
        dot_product = (approach_vector[0] * end_to_start_vector[0] + 
                      approach_vector[1] * end_to_start_vector[1])
        
        approach_magnitude = (approach_vector[0]**2 + approach_vector[1]**2)**0.5
        end_to_start_magnitude = (end_to_start_vector[0]**2 + end_to_start_vector[1]**2)**0.5
        
        if approach_magnitude > 0 and end_to_start_magnitude > 0:
            cosine_similarity = dot_product / (approach_magnitude * end_to_start_magnitude)
            is_valid = cosine_similarity > 0
            logger.info(f"Direction validation: cosine={cosine_similarity:.3f} "
                       f"{'✅' if is_valid else '❌'}")
            return is_valid
        
        return True
    
    def _find_final_extrusion_point(self, lines: List[str], closure_index: int) -> Tuple[Optional[int], Optional[Point2D]]:
        """
        Find the final extrusion point if the closure point is a travel move.
        
        If the closure point is not an extrusion line, look backwards for the last
        extrusion line within 3mm range.
        """
        closure_line = lines[closure_index]
        
        # Check if the closure point is already an extrusion line
        if closure_line.startswith("G1") and "E" in closure_line:
            move = GCodeParser.parse_g1_move(closure_line)
            if move:
                logger.info(f"Closure point at line {closure_index + 1} is already an extrusion line")
                return closure_index, Point2D(move.x, move.y)
        
        # Closure point is a travel move, find the last extrusion within 3mm
        closure_move = GCodeParser.parse_g1_move(closure_line)
        if not closure_move:
            logger.warning(f"Could not parse closure line: {closure_line.strip()}")
            return None, None
        
        closure_point = Point2D(closure_move.x, closure_move.y)
        max_backtrack_distance = 3.0
        
        logger.info(f"Closure point at line {closure_index + 1} is a travel move, searching backwards for last extrusion within {max_backtrack_distance}mm")
        
        # Look backwards for extrusion lines
        for i in range(closure_index - 1, max(0, closure_index - 50), -1):  # Don't go too far back
            line = lines[i]
            if line.startswith("G1") and "E" in line:
                move = GCodeParser.parse_g1_move(line)
                if move:
                    extrusion_point = Point2D(move.x, move.y)
                    distance = closure_point.distance_to(extrusion_point)
                    
                    if distance <= max_backtrack_distance:
                        logger.info(f"Found last extrusion at line {i + 1}: {extrusion_point} (distance: {distance:.3f}mm from closure)")
                        return i, extrusion_point
                    else:
                        logger.info(f"Last extrusion at line {i + 1} too far: {distance:.3f}mm > {max_backtrack_distance}mm")
                        break  # Stop looking if we're getting too far
        
        logger.warning(f"No extrusion line found within {max_backtrack_distance}mm of closure point")
        return None, None

