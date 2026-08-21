import type { WorkspaceUiState } from '../types';

export const defaultWorkspaceUi = (): WorkspaceUiState => ({
  settingsSection: 'machine_config',
  settingsQuery: '',
  prefillDescription: '',
  aiHighlightedFields: {},
  measurementActive: false,
  xrayModel: false,
  gcodePreview: {
    editMode: false,
    layerIndex: -1,
    moveCount: -1,
    showTravel: true,
    showGrid: true,
    showPrintPreview: false,
    mutedToolpaths: [],
    soloedToolpaths: [],
    colorToolpaths: true,
  },
});
