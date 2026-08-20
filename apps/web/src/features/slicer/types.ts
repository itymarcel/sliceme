export type ConfigSection = 'machine_config' | 'process_config' | 'filament_config';

export type ConfigBundle = Record<ConfigSection, Record<string, unknown>>;

export type RangeOverride = {
  range: { min_z: number; max_z: number };
  machine_config: Record<string, unknown>;
  process_config: Record<string, unknown>;
  filament_config: Record<string, unknown>;
};

export type SlicerModel = {
  fileId: string;
  fileName: string;
  fileSize: number;
  objectUrl: string;
  file: File;
};

export type Rotation = { x: number; y: number; z: number };
export type Scale = { x: number; y: number; z: number };
export type Position = { x: number; y: number };
export type BuildVolume = { x: number; y: number; z: number };

export type SelectedNode =
  | { type: 'scene' }
  | { type: 'file'; fileId: string }
  | { type: 'range'; fileId: string; rangeIndex: number };

export type SliceManifest = {
  models: Array<{ id: string; name: string }>;
  config: ConfigBundle;
  fileOverrides: Record<string, Partial<ConfigBundle>>;
  rangeOverrides: Record<string, RangeOverride[]>;
  transforms: Record<string, { position: Position; rotation: Rotation; scale: Scale }>;
  customGcodeForZ: Array<Record<string, unknown>>;
  startPositions: Record<string, Position>;
};

export type GcodeEnhancement = 'perimeter_echo' | 'smooth_vase_transition' | 'coast_final_layer' | 'slow_motion_80';
export type GcodeResult = { blob: Blob; fileName: string; url: string; enhancements: GcodeEnhancement[] };
export type SliceStatus = 'idle' | 'slicing' | 'done' | 'error';
export type AiHighlightedFields = Partial<Record<ConfigSection, string[]>>;

export type SlicerRecommendation = {
  intent_summary: string;
  confidence: number;
  assumptions: string[];
  process_config: Record<string, unknown>;
  filament_config: Record<string, unknown>;
  machine_config: Record<string, unknown>;
  warnings: string[];
  user_specified_overrides: string[];
};

export type GcodePreviewUiState = {
  mode: 'preview' | 'source';
  layerIndex: number;
  moveCount: number;
  showTravel: boolean;
  showGrid: boolean;
  showPrintPreview: boolean;
  mutedToolpaths: string[];
  soloedToolpaths: string[];
  colorToolpaths: boolean;
};

export type WorkspaceUiState = {
  settingsSection: ConfigSection;
  settingsQuery: string;
  prefillDescription: string;
  aiHighlightedFields: AiHighlightedFields;
  measurementActive: boolean;
  xrayModel: boolean;
  gcodePreview: GcodePreviewUiState;
};
