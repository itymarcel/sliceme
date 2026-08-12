"""
Data models and structures for Gradient Perimeter Echo operations.

This module contains all the data classes, enums, and configuration objects
used throughout the gradient perimeter echo system.
"""

import math
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ExtrusionMode(Enum):
    """Enumeration for extrusion modes."""
    ABSOLUTE = "M82"
    RELATIVE = "M83"


@dataclass(frozen=True)
class Point2D:
    """Represents a 2D coordinate point."""
    x: float
    y: float
    
    def distance_to(self, other: 'Point2D') -> float:
        """Calculate Euclidean distance to another point."""
        return math.sqrt((self.x - other.x)**2 + (self.y - other.y)**2)
    
    def __str__(self) -> str:
        """String representation of the point."""
        return f"X{self.x:.3f} Y{self.y:.3f}"


@dataclass(frozen=True)
class GCodeMove:
    """Represents a parsed G-code movement command."""
    x: float
    y: float
    e: Optional[float] = None
    f: Optional[int] = None
    
    @property
    def has_extrusion(self) -> bool:
        """Check if this move includes extrusion."""
        return self.e is not None
    
    @property
    def is_travel_move(self) -> bool:
        """Check if this is a travel move (no extrusion)."""
        return self.e is None
    
    @property
    def position(self) -> Point2D:
        """Get the 2D position of this move."""
        return Point2D(self.x, self.y)


@dataclass
class PerimeterSection:
    """Represents a section of the outer perimeter."""
    start_index: int
    end_index: int
    start_coordinates: Point2D
    end_coordinates: Point2D
    
    @property
    def length(self) -> int:
        """Get the number of lines in this section."""
        return self.end_index - self.start_index


@dataclass
class GradientPerimeterEchoConfig:
    """Configuration for Gradient Perimeter Echo operations."""
    # Core segmentation settings
    max_segment_length: float = 1.0
    copy_ending_percentage: float = 0.25
    max_copy_distance: float = 150.0
    
    # Loop closure detection settings
    loop_closure_tolerance: float = 0.2
    max_pre_travel_distance: float = 10.0
    
    # Extrusion adjustment settings
    first_section_start_multiplier: float = 0.6
    first_section_end_multiplier: float = 0.8
    last_section_start_multiplier: float = 0.5
    last_section_end_multiplier: float = 0.3
    
    # Feedrate adjustment settings
    feedrate_multiplier: float = 0.7
    
    # Feedrate blending settings
    starting_feedrate: int = 400
    
    # Z ramping settings
    z_ramp_start: float = 0.15
    
    def validate(self) -> None:
        """Validate configuration values."""
        if self.max_segment_length <= 0:
            raise ValueError("max_segment_length must be positive")
        if self.copy_ending_percentage < 0 or self.copy_ending_percentage > 1:
            raise ValueError("copy_ending_percentage must be between 0 and 1")
        if self.max_copy_distance < 0:
            raise ValueError("max_copy_distance cannot be negative")
        if self.loop_closure_tolerance <= 0:
            raise ValueError("loop_closure_tolerance must be positive")
        if self.starting_feedrate <= 0:
            raise ValueError("starting_feedrate must be positive")
        if self.z_ramp_start < 0:
            raise ValueError("z_ramp_start cannot be negative")


@dataclass
class SegmentationResult:
    """Result of a segmentation operation."""
    success: bool
    processed_content: str
    original_lines: int
    processed_lines: int
    segments_created: int = 0
    error_message: Optional[str] = None
    
    @property
    def lines_added(self) -> int:
        """Calculate how many lines were added during processing."""
        return self.processed_lines - self.original_lines

