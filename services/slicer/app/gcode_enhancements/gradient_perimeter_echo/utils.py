"""
Utility functions for Gradient Perimeter Echo operations.

This module contains common utility functions used across the gradient perimeter echo system.
"""

import logging
from typing import List, Optional

from .models import Point2D
from .parser import GCodeParser

logger = logging.getLogger(__name__)


class CoordinateFinder:
    """Utility class for finding coordinates in G-code lines."""
    
    @staticmethod
    def find_pre_extrusion_coordinates(lines: List[str], start_index: int, 
                                     first_extrusion_point: Point2D,
                                     max_distance: float = 10.0) -> Optional[Point2D]:
        """
        Find coordinates from travel moves before the first extrusion.
        
        Args:
            lines: List of G-code lines
            start_index: Index of the first extrusion line
            first_extrusion_point: Coordinates of the first extrusion
            max_distance: Maximum allowed distance for travel moves
            
        Returns:
            Point2D with pre-extrusion coordinates, or None if not found
        """
        # Start with the first extrusion coordinates
        current_x = first_extrusion_point.x
        current_y = first_extrusion_point.y
        
        for i in range(start_index - 1, -1, -1):
            line = lines[i]
            
            # Stop at outer perimeter comment
            if "; feature outer perimeter" in line:
                break
            
            # Stop at extrusion moves (we only want travel moves)
            if line.startswith("G1") and "E" in line and ("X" in line or "Y" in line):
                break
            
            # Parse travel moves for X,Y coordinates - handle separate X and Y moves
            if line.startswith("G1") and ("X" in line or "Y" in line):
                parts = line.strip().split()
                for part in parts:
                    if part.startswith("X"):
                        try:
                            current_x = float(part[1:])
                        except ValueError:
                            continue
                    elif part.startswith("Y"):
                        try:
                            current_y = float(part[1:])
                        except ValueError:
                            continue
        
        pre_extrusion_point = Point2D(current_x, current_y)
        distance = pre_extrusion_point.distance_to(first_extrusion_point)
        
        if distance <= max_distance and distance > 0.001:
            logger.debug(f"Found pre-extrusion coordinates: {pre_extrusion_point} "
                        f"(distance: {distance:.3f}mm)")
            return pre_extrusion_point
        
        logger.debug(f"Pre-extrusion distance ({distance:.3f}mm) exceeds limit ({max_distance}mm)")
        return None
    
    @staticmethod
    def find_coordinates_near_target(lines: List[str], start_index: int, end_index: int,
                                   target_coordinates: Point2D, tolerance: float = 0.01) -> Optional[int]:
        """
        Find the line index with coordinates matching the target within tolerance.
        
        Args:
            lines: List of G-code lines
            start_index: Start searching from this index
            end_index: Stop searching at this index  
            target_coordinates: Target coordinates to match
            tolerance: Distance tolerance for matching
            
        Returns:
            Line index with matching coordinates, or None if not found
        """
        for i in range(start_index, end_index):
            line = lines[i]
            if GCodeParser.is_extrusion_line(line):
                move = GCodeParser.parse_g1_move(line)
                if move:
                    line_position = Point2D(move.x, move.y)
                    distance = line_position.distance_to(target_coordinates)
                    
                    if distance <= tolerance:
                        logger.debug(f"Found matching coordinates at line {i+1}: {line_position} "
                                   f"(distance: {distance:.4f}mm)")
                        return i
        
        return None
    
    @staticmethod
    def find_last_coordinate_before_index(lines: List[str], before_index: int) -> Optional[Point2D]:
        """
        Find the last known coordinates before the given index.
        
        Args:
            lines: List of G-code lines
            before_index: Index to search backwards from
            
        Returns:
            Point2D with the last known coordinates, or None if not found
        """
        for i in range(before_index - 1, -1, -1):
            line = lines[i]
            if line.startswith("G1") and ("X" in line or "Y" in line):
                move = GCodeParser.parse_g1_move(line)
                if move:
                    logger.debug(f"Found last coordinates before line {before_index}: {move.x}, {move.y}")
                    return Point2D(move.x, move.y)
        
        return None
