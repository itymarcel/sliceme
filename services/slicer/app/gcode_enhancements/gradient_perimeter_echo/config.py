"""
Configuration management for Gradient Perimeter Echo.

This module provides configuration classes and factory functions for
creating gradient perimeter echo configurations with sensible defaults.
"""

from .models import GradientPerimeterEchoConfig


class ConfigPresets:
    """Predefined configuration presets for common use cases."""
    
    @staticmethod
    def default() -> GradientPerimeterEchoConfig:
        """Default configuration suitable for most prints."""
        return GradientPerimeterEchoConfig()
    
    @staticmethod
    def fine_detail() -> GradientPerimeterEchoConfig:
        """Configuration optimized for fine detail prints with enhanced gradient echo."""
        return GradientPerimeterEchoConfig(
            max_segment_length=0.5,
            copy_ending_percentage=0.4,
            max_copy_distance=100.0,
            loop_closure_tolerance=0.2,
            first_section_start_multiplier=0.1,
            feedrate_multiplier=0.6
        )
    
    @staticmethod
    def fast_print() -> GradientPerimeterEchoConfig:
        """Configuration optimized for faster printing."""
        return GradientPerimeterEchoConfig(
            max_segment_length=2.0,
            copy_ending_percentage=0.6,
            max_copy_distance=200.0,
            loop_closure_tolerance=1.0,
            first_section_start_multiplier=0.4,
            feedrate_multiplier=0.9
        )
    
    @staticmethod
    def large_perimeter() -> GradientPerimeterEchoConfig:
        """Configuration for prints with large perimeters."""
        return GradientPerimeterEchoConfig(
            max_segment_length=1.5,
            copy_ending_percentage=0.3,
            max_copy_distance=150.0,
            loop_closure_tolerance=0.8,
            max_pre_travel_distance=5.0
        )


def create_config(**kwargs) -> GradientPerimeterEchoConfig:
    """
    Create a configuration with custom parameters.
    
    Args:
        **kwargs: Configuration parameters to override defaults
        
    Returns:
        GradientPerimeterEchoConfig with specified overrides
        
    Example:
        config = create_config(max_segment_length=0.8, copy_ending_percentage=0.3, max_copy_distance=100.0)
    """
    config = GradientPerimeterEchoConfig(**kwargs)
    config.validate()
    return config

