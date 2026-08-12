"""
G-code parsing utilities for Gradient Perimeter Echo operations.

This module handles parsing of G-code lines and extracting movement information
for gradient perimeter echo processing.
"""

import logging
from typing import List, Optional

from .models import GCodeMove, ExtrusionMode

logger = logging.getLogger(__name__)


class GCodeParser:
    """Handles parsing of G-code lines and movements."""
    
    @staticmethod
    def parse_g1_move(line: str) -> Optional[GCodeMove]:
        """
        Parse a G1 move line and extract X, Y, E, and F values.
        
        Args:
            line: G-code line starting with G1
            
        Returns:
            GCodeMove object or None if parsing fails
        """
        try:
            parts = line.strip().split()
            x = y = e = f = None
            
            for part in parts:
                if part.startswith("X"):
                    x = float(part[1:])
                elif part.startswith("Y"):
                    y = float(part[1:])
                elif part.startswith("E"):
                    e = float(part[1:])
                elif part.startswith("F"):
                    # Handle both integer and float feedrates, and comments
                    f_part = part[1:]
                    # Remove any trailing comments (semicolon and beyond)
                    if ';' in f_part:
                        f_part = f_part.split(';')[0]
                    # Convert to int, handling floats by truncating
                    f = int(float(f_part))
            
            if x is not None and y is not None:
                return GCodeMove(x=x, y=y, e=e, f=f)
                
        except (ValueError, IndexError) as ex:
            logger.warning(f"Failed to parse G1 move '{line.strip()}': {ex}")
        
        return None
    
    @staticmethod
    def find_extrusion_mode(lines: List[str], before_index: int) -> ExtrusionMode:
        """
        Find the extrusion mode by scanning backwards from the given index.
        
        Args:
            lines: List of G-code lines
            before_index: Index to scan backwards from
            
        Returns:
            ExtrusionMode (defaults to ABSOLUTE)
        """
        for i in range(before_index - 1, -1, -1):
            line = lines[i].strip().split(';', 1)[0].strip()
            if line == ExtrusionMode.ABSOLUTE.value:
                return ExtrusionMode.ABSOLUTE
            elif line == ExtrusionMode.RELATIVE.value:
                return ExtrusionMode.RELATIVE
        
        return ExtrusionMode.ABSOLUTE  # Default to absolute
    
    
    @staticmethod
    def is_extrusion_line(line: str) -> bool:
        """Check if a line is a G1 movement command with extrusion."""
        return (line.startswith("G1") and 
                "E" in line and 
                ("X" in line or "Y" in line))
    
    @staticmethod
    def build_g1_line(move: GCodeMove) -> str:
        """
        Build a G1 command line from a GCodeMove object.
        
        Args:
            move: GCodeMove object to convert to G-code
            
        Returns:
            G-code line string
        """
        line = f"G1 X{move.x:.3f} Y{move.y:.3f}"
        
        if move.e is not None:
            line += f" E{move.e:.5f}"
        
        if move.f is not None:
            line += f" F{move.f}"
        
        return line + "\n"
    
    @staticmethod
    def adjust_extrusion_in_line(line: str, multiplier: float) -> Optional[str]:
        """
        Adjust the extrusion value in a G1 line by the given multiplier.
        
        Args:
            line: G-code line to adjust
            multiplier: Multiplier to apply to extrusion value
            
        Returns:
            Modified line with adjusted extrusion, or None if adjustment failed
        """
        try:
            parts = line.strip().split()
            new_parts = []
            
            for part in parts:
                if part.startswith("E"):
                    # Extract and adjust extrusion value
                    e_value = float(part[1:])
                    adjusted_e = e_value * multiplier
                    new_parts.append(f"E{adjusted_e:.5f}")
                else:
                    new_parts.append(part)
            
            return " ".join(new_parts) + "\n"
        
        except (ValueError, IndexError):
            logger.warning(f"Failed to adjust extrusion in line: {line.strip()}")
            return None

