import { useEffect, useMemo, useState } from 'react';
import { Code2, Search, Sparkles, X } from 'lucide-react';

import type { AiHighlightedFields, ConfigBundle, ConfigSection, PrintPreset, PrinterPreset, RangeOverride, SelectedNode } from '../types';
import { rangeHelp, settingHelp } from '../lib/settingHelp';
import { buildDimensionsFromMachineConfig, findMatchingPrinterPreset, findMatchingPrintPreset } from '../lib/printerPresets';
import { ParameterHelp } from './ParameterHelp';
import { SearchableSelect } from './SearchableSelect';

type Field = {
  key: string;
  label: string;
  type?: 'number' | 'checkbox' | 'select' | 'text';
  step?: number;
  min?: number;
  max?: number;
  options?: Array<{ label: string; value: string }>;
};
type Group = { label: string; fields: Field[] };

const fields: Record<ConfigSection, Group[]> = {
  machine_config: [
    { label: 'Build volume', fields: [
      { key: 'printable_width', label: 'Bed width', type: 'number', min: 1 },
      { key: 'printable_depth', label: 'Bed depth', type: 'number', min: 1 },
      { key: 'printable_height', label: 'Build height', type: 'number', min: 1 },
      { key: 'nozzle_diameter', label: 'Nozzle diameter', type: 'select', options: ['0.2', '0.25', '0.4', '0.6', '0.8', '1.0', '1.2', '1.4', '1.6', '1.8', '2.0'].map((value) => ({ label: `${value} mm`, value })) },
      { key: 'nozzle_type', label: 'Nozzle type', type: 'select', options: ['undefine', 'hardened_steel', 'stainless_steel', 'brass'].map((value) => ({ label: value.replaceAll('_', ' '), value })) },
      { key: 'gcode_flavor', label: 'G-code flavor', type: 'select', options: ['marlin', 'klipper', 'reprapfirmware'].map((value) => ({ label: value, value })) },
      { key: 'z_offset', label: 'Z offset', type: 'number', step: 0.01 },
      { key: 'extruder_clearance_height_to_rod', label: 'Clearance height', type: 'number' },
    ] },
    { label: 'Motion limits', fields: [
      { key: 'machine_max_speed_x', label: 'Maximum X speed', type: 'number' },
      { key: 'machine_max_speed_y', label: 'Maximum Y speed', type: 'number' },
      { key: 'machine_max_speed_z', label: 'Maximum Z speed', type: 'number' },
      { key: 'machine_max_acceleration_extruding', label: 'Maximum acceleration', type: 'number' },
      { key: 'default_acceleration', label: 'Default acceleration', type: 'number' },
    ] },
    { label: 'Machine G-code', fields: [
      { key: 'machine_start_gcode', label: 'Start G-code', type: 'text' },
      { key: 'machine_end_gcode', label: 'End G-code', type: 'text' },
      { key: 'emit_machine_limits_to_gcode', label: 'Emit machine limits', type: 'checkbox' },
      { key: 'silent_mode', label: 'Silent mode', type: 'checkbox' },
    ] },
  ],
  filament_config: [
    { label: 'Material', fields: [
      { key: 'filament_type', label: 'Filament', type: 'select', options: ['PLA', 'PETG', 'ABS', 'ABS-GF', 'ASA', 'ASA-CF', 'PA', 'PA-CF', 'PC', 'PC-CF', 'PETG-CF', 'PP', 'PVA', 'TPU'].map((value) => ({ label: value, value })) },
      { key: 'filament_diameter', label: 'Diameter', type: 'number', step: 0.05 },
      { key: 'filament_flow_ratio', label: 'Flow ratio', type: 'number', step: 0.01 },
      { key: 'filament_max_volumetric_speed', label: 'Maximum volumetric speed', type: 'number' },
    ] },
    { label: 'Temperature', fields: [
      { key: 'nozzle_temperature', label: 'Nozzle temperature', type: 'number' },
      { key: 'nozzle_temperature_initial_layer', label: 'First-layer nozzle', type: 'number' },
      { key: 'hot_plate_temp', label: 'Bed temperature', type: 'number' },
      { key: 'hot_plate_temp_initial_layer', label: 'First-layer bed', type: 'number' },
    ] },
    { label: 'Cooling', fields: [
      { key: 'fan_min_speed', label: 'Minimum fan', type: 'number' },
      { key: 'fan_max_speed', label: 'Maximum fan', type: 'number' },
      { key: 'close_fan_the_first_x_layers', label: 'Fan off for first layers', type: 'number' },
      { key: 'full_fan_speed_layer', label: 'Full fan at layer', type: 'number' },
      { key: 'additional_cooling_fan_speed', label: 'Additional fan', type: 'number' },
      { key: 'slow_down_layer_time', label: 'Slow-down layer time', type: 'number' },
      { key: 'slow_down_for_layer_cooling', label: 'Slow down for cooling', type: 'checkbox' },
    ] },
    { label: 'Pressure advance', fields: [
      { key: 'enable_pressure_advance', label: 'Enable pressure advance', type: 'checkbox' },
      { key: 'pressure_advance', label: 'Pressure advance', type: 'number', step: 0.001 },
    ] },
    { label: 'Retraction', fields: [
      { key: 'filament_retraction_length', label: 'Retraction length', type: 'number', step: 0.1 },
      { key: 'filament_retraction_speed', label: 'Retraction speed', type: 'number' },
      { key: 'filament_retraction_minimum_travel', label: 'Minimum travel', type: 'number' },
      { key: 'filament_retract_when_changing_layer', label: 'Retract on layer change', type: 'checkbox' },
    ] },
    { label: 'Material properties', fields: [
      { key: 'filament_shrink', label: 'Shrink compensation', type: 'number' },
      { key: 'temperature_vitrification', label: 'Vitrification temperature', type: 'number' },
      { key: 'filament_start_gcode', label: 'Filament start G-code', type: 'text' },
      { key: 'filament_end_gcode', label: 'Filament end G-code', type: 'text' },
    ] },
  ],
  process_config: [
    { label: 'Quality', fields: [
      { key: 'layer_height', label: 'Layer height', type: 'number', step: 0.05 },
      { key: 'initial_layer_print_height', label: 'First-layer height', type: 'number', step: 0.05 },
      { key: 'line_width', label: 'Line width', type: 'number', step: 0.01 },
      { key: 'resolution', label: 'Resolution', type: 'number', step: 0.001 },
      { key: 'seam_position', label: 'Seam position', type: 'select', options: ['aligned', 'nearest', 'random', 'rear'].map((value) => ({ label: value, value })) },
      { key: 'spiral_mode', label: 'Spiral / vase mode', type: 'checkbox' },
      { key: 'spiral_mode_smooth', label: 'Smooth spiral', type: 'checkbox' },
    ] },
    { label: 'Walls and surfaces', fields: [
      { key: 'wall_loops', label: 'Wall loops', type: 'number' },
      { key: 'wall_sequence', label: 'Wall sequence', type: 'select', options: ['inner wall/outer wall', 'outer wall/inner wall', 'inner-outer-inner wall'].map((value) => ({ label: value, value })) },
      { key: 'wall_generator', label: 'Wall generator', type: 'select', options: [{ label: 'Arachne', value: 'arachne' }, { label: 'Classic', value: 'classic' }] },
      { key: 'top_shell_layers', label: 'Top layers', type: 'number' },
      { key: 'bottom_shell_layers', label: 'Bottom layers', type: 'number' },
      { key: 'detect_thin_wall', label: 'Detect thin walls', type: 'checkbox' },
      { key: 'precise_outer_wall', label: 'Precise outer wall', type: 'checkbox' },
      { key: 'top_surface_pattern', label: 'Top pattern', type: 'select', options: ['rectilinear', 'monotonic', 'monotonicline', 'concentric', 'hilbertcurve'].map((value) => ({ label: value, value })) },
      { key: 'bottom_surface_pattern', label: 'Bottom pattern', type: 'select', options: ['rectilinear', 'monotonic', 'monotonicline', 'concentric'].map((value) => ({ label: value, value })) },
    ] },
    { label: 'Infill', fields: [
      { key: 'sparse_infill_density', label: 'Density', type: 'number', step: 5 },
      { key: 'sparse_infill_pattern', label: 'Pattern', type: 'select', options: ['rectilinear', 'grid', 'triangles', 'cubic', 'adaptivecubic', 'lightning', 'honeycomb', '3dhoneycomb', 'crosshatch', 'gyroid', 'concentric'].map((value) => ({ label: value, value })) },
      { key: 'infill_direction', label: 'Direction', type: 'number' },
    ] },
    { label: 'Speed', fields: [
      { key: 'initial_layer_speed', label: 'First layer', type: 'number' },
      { key: 'outer_wall_speed', label: 'Outer wall', type: 'number' },
      { key: 'inner_wall_speed', label: 'Inner wall', type: 'number' },
      { key: 'sparse_infill_speed', label: 'Sparse infill', type: 'number' },
      { key: 'internal_solid_infill_speed', label: 'Solid infill', type: 'number' },
      { key: 'top_surface_speed', label: 'Top surface', type: 'number' },
      { key: 'travel_speed', label: 'Travel', type: 'number' },
      { key: 'bridge_speed', label: 'Bridge', type: 'number' },
      { key: 'outer_wall_acceleration', label: 'Outer-wall acceleration', type: 'number' },
      { key: 'bridge_acceleration', label: 'Bridge acceleration', type: 'number' },
    ] },
    { label: 'Support and adhesion', fields: [
      { key: 'enable_support', label: 'Enable support', type: 'checkbox' },
      { key: 'support_threshold_angle', label: 'Support threshold', type: 'number' },
      { key: 'support_type', label: 'Support type', type: 'select', options: [{ label: 'Normal (auto)', value: 'normal(auto)' }, { label: 'Tree (auto)', value: 'tree(auto)' }, { label: 'Normal (manual)', value: 'normal(manual)' }, { label: 'Tree (manual)', value: 'tree(manual)' }] },
      { key: 'support_style', label: 'Support style', type: 'select', options: ['default', 'grid', 'snug', 'organic', 'tree_slim', 'tree_strong', 'tree_hybrid'].map((value) => ({ label: value, value })) },
      { key: 'brim_type', label: 'Brim', type: 'select', options: [{ label: 'Automatic', value: 'auto_brim' }, { label: 'Mouse ear', value: 'brim_ears' }, { label: 'Painted', value: 'painted' }, { label: 'Outer only', value: 'outer_only' }, { label: 'Inner only', value: 'inner_only' }, { label: 'Outer and inner', value: 'outer_and_inner' }, { label: 'None', value: 'no_brim' }] },
      { key: 'brim_width', label: 'Brim width', type: 'number' },
      { key: 'skirt_loops', label: 'Skirt loops', type: 'number', min: 0, max: 10 },
      { key: 'skirt_distance', label: 'Skirt distance', type: 'number' },
      { key: 'raft_layers', label: 'Raft layers', type: 'number' },
    ] },
    { label: 'Surface finish', fields: [
      { key: 'retraction_length', label: 'Retraction length', type: 'number' },
      { key: 'z_hop', label: 'Z hop', type: 'number' },
      { key: 'ironing_type', label: 'Ironing', type: 'select', options: ['no ironing', 'top', 'topmost', 'solid'].map((value) => ({ label: value, value })) },
      { key: 'elefant_foot_compensation', label: 'Elephant-foot compensation', type: 'number', step: 0.01 },
      { key: 'bridge_flow', label: 'Bridge flow', type: 'number', step: 0.01 },
      { key: 'fuzzy_skin', label: 'Fuzzy skin', type: 'select', options: [{ label: 'Painted only', value: 'none' }, { label: 'Contour', value: 'external' }, { label: 'Hole', value: 'hole' }, { label: 'Contour and hole', value: 'all' }, { label: 'All walls', value: 'allwalls' }, { label: 'Disabled', value: 'disabled_fuzzy' }] },
      { key: 'fuzzy_skin_thickness', label: 'Fuzzy-skin thickness', type: 'number', step: 0.01 },
    ] },
  ],
};

type Props = {
  selectedNode: SelectedNode;
  config: ConfigBundle;
  fileOverrides: Record<string, Partial<ConfigBundle>>;
  rangeOverrides: Record<string, RangeOverride[]>;
  onChange: (section: ConfigSection, key: string, value: unknown) => void;
  printerPresets: PrinterPreset[];
  printPresets: PrintPreset[];
  onApplyPrinterPreset: (presetId: string) => void;
  onApplyPrintPreset: (presetId: string) => void;

  onRangeBoundary: (fileId: string, rangeIndex: number, key: 'min_z' | 'max_z', value: number) => void;
  section: ConfigSection;
  query: string;
  onSectionChange: (section: ConfigSection) => void;
  onQueryChange: (query: string) => void;
  highlightedFields: AiHighlightedFields;
  onFieldInteract: (section: ConfigSection, key: string) => void;
};

const overrideConfig = (props: Props, section: ConfigSection) => {
  const { selectedNode, config, fileOverrides, rangeOverrides } = props;
  if (selectedNode.type === 'scene') return { resolved: config[section], own: config[section] };
  const file = fileOverrides[selectedNode.fileId]?.[section] ?? {};
  if (selectedNode.type === 'file') return { resolved: { ...config[section], ...file }, own: file };
  const range = rangeOverrides[selectedNode.fileId]?.[selectedNode.rangeIndex]?.[section] ?? {};
  return { resolved: { ...config[section], ...file, ...range }, own: range };
};

type GcodeEditor = { section: ConfigSection; key: string; label: string; value: string };

function FieldControl({ field, section, props, onEditGcode }: { field: Field; section: ConfigSection; props: Props; onEditGcode: (editor: GcodeEditor) => void }) {
  const { resolved, own } = overrideConfig(props, section);
  const buildDimensions = section === 'machine_config' ? buildDimensionsFromMachineConfig(resolved) : null;
  const value = field.key === 'printable_width' ? buildDimensions?.width
    : field.key === 'printable_depth' ? buildDimensions?.depth
      : resolved[field.key];
  const scalarValue = Array.isArray(value) ? value[0] : value;
  const overridden = props.selectedNode.type !== 'scene' && Object.hasOwn(own, field.key);
  const globalFromObject = field.key === 'spiral_mode' && props.selectedNode.type === 'file';
  const aiRecommended = props.selectedNode.type === 'scene' && props.highlightedFields[section]?.includes(field.key);
  const update = (raw: string | boolean) => {
    props.onFieldInteract(section, field.key);
    if (field.type === 'checkbox') props.onChange(section, field.key, raw ? '1' : '0');
    else if (field.type === 'number' && typeof scalarValue === 'string' && scalarValue.trim().endsWith('%')) props.onChange(section, field.key, `${raw}%`);
    else props.onChange(section, field.key, raw);
  };
  const displayValue = field.type === 'number' && typeof scalarValue === 'string'
    ? scalarValue.replace(/%$/, '')
    : scalarValue;
  const help = settingHelp[field.key] ?? { text: `Controls the ${field.label.toLowerCase()} used by the slicer.` };

  return (
    <div className={`setting-row ${overridden ? 'is-overridden' : ''} ${aiRecommended ? 'ai-recommended' : ''}`}>
      <span title={globalFromObject ? 'Spiral mode applies to the whole print' : undefined}>
        <span id={`setting-${field.key}`}>{field.label}{globalFromObject ? ' (global)' : ''}</span>
        <ParameterHelp label={field.label} text={help.text} diagram={help.diagram} />
        {aiRecommended && <Sparkles className="ai-recommended-icon" size={11} aria-label="AI recommended" />}
      </span>
      <div className="setting-control">
        {field.type === 'checkbox' ? (
          <input aria-labelledby={`setting-${field.key}`} type="checkbox" checked={displayValue === true || displayValue === '1'} onChange={(event) => update(event.target.checked)} />
        ) : field.type === 'select' ? (
          <select aria-labelledby={`setting-${field.key}`} value={String(displayValue ?? '')} onChange={(event) => update(event.target.value)}>
            {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : field.type === 'text' ? (
          <button className="gcode-edit-button" type="button" aria-label={`Edit ${field.label}`} onClick={() => onEditGcode({ section, key: field.key, label: field.label, value: String(displayValue ?? '') })}>
            <Code2 size={13} /> Edit
          </button>
        ) : (
          <input aria-labelledby={`setting-${field.key}`} type="number" step={field.step ?? 1} min={field.min} max={field.max} value={String(displayValue ?? '')} onChange={(event) => update(event.target.value)} />
        )}

      </div>
    </div>
  );
}

export function SlicerSettingsPanel(props: Props) {
  const { section, query } = props;
  const [editor, setEditor] = useState<GcodeEditor | null>(null);
  const [gcodeDraft, setGcodeDraft] = useState('');
  const visibleGroups = useMemo(() => fields[section].map((group) => ({
    ...group,
    fields: group.fields.filter((field) => `${group.label} ${field.label}`.toLowerCase().includes(query.toLowerCase())),
  })).filter((group) => group.fields.length), [query, section]);
  const rangeSelection = props.selectedNode.type === 'range' ? props.selectedNode : null;
  const range = rangeSelection ? props.rangeOverrides[rangeSelection.fileId]?.[rangeSelection.rangeIndex] : null;
  const printerPresetId = findMatchingPrinterPreset(props.config.machine_config, props.printerPresets);
  const printPresetId = findMatchingPrintPreset(props.config.process_config, props.printPresets);

  const openEditor = (nextEditor: GcodeEditor) => {
    setEditor(nextEditor);
    setGcodeDraft(nextEditor.value);
  };
  const closeEditor = () => setEditor(null);
  const saveEditor = () => {
    if (!editor) return;
    props.onChange(editor.section, editor.key, gcodeDraft);
    closeEditor();
  };

  useEffect(() => {
    if (!editor) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeEditor(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [editor]);

  useEffect(() => {
    if (props.selectedNode.type !== 'scene' && section === 'machine_config') props.onSectionChange('process_config');
  }, [props, section]);

  return (
    <section className="settings-panel panel">
      <div className="panel-heading">
        <div><strong>{props.selectedNode.type === 'scene' ? 'Global' : props.selectedNode.type === 'file' ? 'Object override' : 'Height-range override'}</strong></div>
      </div>
      {range && rangeSelection && (
        <div className="range-boundaries">
          <div className="range-field"><span><label htmlFor="range-min-z">From</label><ParameterHelp label="Range start" text={rangeHelp.min_z.text} diagram={rangeHelp.min_z.diagram} /></span><input id="range-min-z" type="number" step="0.1" value={range.range.min_z} onChange={(event) => props.onRangeBoundary(rangeSelection.fileId, rangeSelection.rangeIndex, 'min_z', Number(event.target.value))} /></div>
          <div className="range-field"><span><label htmlFor="range-max-z">To</label><ParameterHelp label="Range end" text={rangeHelp.max_z.text} diagram={rangeHelp.max_z.diagram} /></span><input id="range-max-z" type="number" step="0.1" value={range.range.max_z} onChange={(event) => props.onRangeBoundary(rangeSelection.fileId, rangeSelection.rangeIndex, 'max_z', Number(event.target.value))} /></div>
          <span>mm</span>
        </div>
      )}
      <div className="settings-tabs">
        {(['machine_config', 'filament_config', 'process_config'] as ConfigSection[]).map((tab) => (
          <button key={tab} disabled={tab === 'machine_config' && props.selectedNode.type !== 'scene'} className={section === tab ? 'active' : ''} onClick={() => props.onSectionChange(tab)}>
            {tab.split('_')[0]}
          </button>
        ))}
      </div>
      <div className="settings-scroll">
        {section === 'machine_config' && props.selectedNode.type === 'scene' && (
          <div className="settings-group">
            <h3>Target printer</h3>
            <div className="setting-row">
              <span>
                <span id="setting-printer-preset">Printer profile</span>
                <ParameterHelp label="Printer profile" text="Replaces the complete machine configuration with the selected Orca profile, including build volume, nozzle, firmware, limits, and machine G-code." />
              </span>
              <div className="setting-control">
                <SearchableSelect
                  id="printer-preset"
                  label="Printer profile"
                  value={printerPresetId}
                  options={props.printerPresets.map((preset) => ({ value: preset.id, label: `${preset.manufacturer} · ${preset.name}` }))}
                  placeholder="Custom machine"
                  onChange={props.onApplyPrinterPreset}
                />
              </div>
            </div>
          </div>
        )}
        {section === 'process_config' && props.selectedNode.type === 'scene' && (
          <div className="settings-group">
            <h3>Print profile</h3>
            <div className="setting-row">
              <span>
                <span id="setting-print-preset">Print preset</span>
                <ParameterHelp label="Print preset" text="Replaces the complete current process configuration with a curated quality preset. Applying one overwrites all current print settings." />
              </span>
              <div className="setting-control">
                <SearchableSelect
                  id="print-preset"
                  label="Print preset"
                  value={printPresetId}
                  options={props.printPresets.map((preset) => ({ value: preset.id, label: preset.name }))}
                  placeholder="Custom print settings"
                  onChange={props.onApplyPrintPreset}
                />
              </div>
            </div>
          </div>
        )}
        {visibleGroups.map((group) => (
          <div className="settings-group" key={group.label}>
            <h3>{group.label}</h3>
            {group.fields.map((field) => <FieldControl key={field.key} field={field} section={section} props={props} onEditGcode={openEditor} />)}
          </div>
        ))}
      </div>
      <label className="settings-search"><Search size={14} /><input value={query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="Find a setting" /></label>
      {editor && (
        <div className="gcode-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) closeEditor(); }}>
          <section className="gcode-editor panel" role="dialog" aria-modal="true" aria-labelledby="gcode-editor-title">
            <header>
              <div><span className="eyebrow">G-code editor</span><strong id="gcode-editor-title">{editor.label}</strong></div>
              <button className="icon-button" type="button" aria-label="Close G-code editor" onClick={closeEditor}><X size={16} /></button>
            </header>
            <textarea autoFocus aria-label={editor.label} spellCheck={false} value={gcodeDraft} onChange={(event) => setGcodeDraft(event.target.value)} />
            <footer>
              <button className="button ghost" type="button" onClick={closeEditor}>Cancel</button>
              <button className="button primary" type="button" aria-label="Save G-code" onClick={saveEditor}>Save</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
