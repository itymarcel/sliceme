import { describe, expect, it } from 'vitest';

import { settingHelp } from './settingHelp';

describe('Orca setting help semantics', () => {
  it('states the direction and zero-value behavior of the support threshold', () => {
    expect(settingHelp.support_threshold_angle.text).toContain('below this angle');
    expect(settingHelp.support_threshold_angle.text).toContain('Smaller values allow steeper unsupported slopes');
    expect(settingHelp.support_threshold_angle.text).toContain('30° for tree support');
  });

  it('does not claim the silent-mode capability switch activates quiet printing', () => {
    expect(settingHelp.silent_mode.text).toContain('lower-acceleration limit set');
    expect(settingHelp.silent_mode.text).toContain('does not switch the printer into quiet mode');
  });

  it('distinguishes layer height from first-layer height', () => {
    expect(settingHelp.layer_height.diagram).toBe('layers');
    expect(settingHelp.initial_layer_print_height.diagram).toBe('first-layer');
    expect(settingHelp.initial_layer_print_height.text).toContain('build-plate adhesion');
  });

  it('describes Orca raft and brim dimensions precisely', () => {
    expect(settingHelp.raft_layers.text).toContain('Raises the model');
    expect(settingHelp.brim_width.text).toContain('outermost brim line');
  });

  it('illustrates brim and skirt settings', () => {
    expect(settingHelp.brim_type.diagram).toBe('brim-type');
    expect(settingHelp.brim_width.diagram).toBe('brim');
    expect(settingHelp.brim_type.diagram).not.toBe(settingHelp.brim_width.diagram);
    expect(settingHelp.skirt_loops.diagram).toBe('skirt');
    expect(settingHelp.skirt_loops.text).toContain('Zero disables the skirt');
    expect(settingHelp.skirt_distance.diagram).toBe('skirt');
  });

  it('uses dedicated diagrams for spiral, shell, and machine Z settings', () => {
    expect(settingHelp.spiral_mode.diagram).toBe('spiral');
    expect(settingHelp.top_shell_layers.diagram).toBe('top-layers');
    expect(settingHelp.bottom_shell_layers.diagram).toBe('bottom-layers');
    expect(settingHelp.printable_height.diagram).toBe('printable-height');
    expect(settingHelp.z_offset.diagram).toBe('z-offset');
  });
});
