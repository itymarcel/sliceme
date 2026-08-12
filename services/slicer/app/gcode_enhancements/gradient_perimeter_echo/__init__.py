"""
Gradient Perimeter Echo Module

A comprehensive module for processing G-code files with gradient perimeter echo,
perimeter detection, and various print quality improvements.

This module provides:
- Automatic detection of outer perimeter sections
- Gradient perimeter echo for improved layer adhesion and surface quality
- Segmentation of long G-code lines for improved print quality
- Copying of ending sections to the front for better layer adhesion
- Configurable extrusion and feedrate adjustments

Example usage:
    from operations.gradient_perimeter_echo import process_gcode, ConfigPresets
    
    # Using default configuration
    result = process_gcode(gcode_content)
    
    # Using a preset configuration
    config = ConfigPresets.fine_detail()
    result = process_gcode(gcode_content, config)
    
    # Custom configuration
    from operations.gradient_perimeter_echo import create_config
    config = create_config(max_segment_length=0.8, copy_ending_percentage=0.3, max_copy_distance=100.0)
    result = process_gcode(gcode_content, config)
"""

from .config import ConfigPresets, create_config
from .models import (
    GradientPerimeterEchoConfig, 
    SegmentationResult, 
    Point2D, 
    GCodeMove, 
    PerimeterSection,
    ExtrusionMode
)
from .processor import GCodeSegmentationProcessor
from .utils import CoordinateFinder

# Main public interface
def process_gcode(gcode_content: str, config: GradientPerimeterEchoConfig = None) -> SegmentationResult:
    """
    Process G-code content with gradient perimeter echo and modifications.
    
    This is the main entry point for the gradient perimeter echo module. It provides
    a clean interface for processing G-code files with various improvements including
    gradient perimeter effects for enhanced layer adhesion and surface quality.
    
    Args:
        gcode_content: The original G-code content as a string
        config: Optional GradientPerimeterEchoConfig. If None, uses default configuration.
        
    Returns:
        SegmentationResult containing the processed content and metadata
        
    Example:
        >>> from operations.segmentation import process_gcode, ConfigPresets
        >>> 
        >>> # Basic usage
        >>> result = process_gcode(gcode_content)
        >>> if result.success:
        >>>     print(f"Processed {result.original_lines} -> {result.processed_lines} lines")
        >>>     with open('output.gcode', 'w') as f:
        >>>         f.write(result.processed_content)
        >>> 
        >>> # With custom configuration
        >>> config = ConfigPresets.fine_detail()
        >>> result = process_gcode(gcode_content, config)
    """
    processor = GCodeSegmentationProcessor(config)
    return processor.process_gcode(gcode_content)



# Module metadata
__version__ = "2.0.0"
__author__ = "Batch Print Automator"
__description__ = "Gradient Perimeter Echo processing module"

# Public API
__all__ = [
    # Main interface
    'process_gcode',
    
    # Configuration
    'GradientPerimeterEchoConfig',
    'ConfigPresets', 
    'create_config',
    
    # Data models
    'SegmentationResult',
    'Point2D',
    'GCodeMove',
    'PerimeterSection',
    'ExtrusionMode',
    
    # Processor
    'GCodeSegmentationProcessor',
    
    # Utilities
    'CoordinateFinder',
]

