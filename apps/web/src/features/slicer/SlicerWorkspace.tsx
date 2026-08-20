import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Download, Eraser, FileUp, LoaderCircle, OctagonX, Redo2, ShieldCheck, SlidersHorizontal, Slice, Undo2, X } from 'lucide-react';

import { GcodePreview } from './components/GcodePreview';
import { AiPrefillPanel } from './components/AiPrefillPanel';
import ModelViewport, { type ModelViewportHandle } from './components/ModelViewport';
import { CameraPresetControls } from './components/CameraPresetControls';
import { ObjectTree } from './components/ObjectTree';
import { SlicerSettingsPanel } from './components/SlicerSettingsPanel';
import { TransformPanel } from './components/TransformPanel';
import { MeasurementPanel } from './components/MeasurementPanel';
import { HeaderMoreMenu } from './components/HeaderMoreMenu';
import { MobileActionsMenu } from './components/MobileActionsMenu';
import { SupportLink } from './components/ProjectLinks';
import { useSlicerWorkspace } from './hooks/useSlicerWorkspace';
import { addMeasurementPoint, type MeasurementPoint } from './lib/measurement';
import { isEditableShortcutTarget } from './lib/historyShortcuts';

export function SlicerWorkspace() {
  const workspace = useSlicerWorkspace();
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<ModelViewportHandle>(null);
  const [dragging, setDragging] = useState(false);
  const [expandedViewer, setExpandedViewer] = useState<'model' | 'gcode' | null>(null);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const measurementActive = workspace.ui.measurementActive;
  const setMeasurementActive = (value: boolean | ((current: boolean) => boolean)) => workspace.setUi((current) => ({
    ...current,
    measurementActive: typeof value === 'function' ? value(current.measurementActive) : value,
  }));
  const [measurementPoints, setMeasurementPoints] = useState<MeasurementPoint[]>([]);
  const selectedFileId = workspace.selectedNode.type === 'scene' ? undefined : workspace.selectedNode.fileId;
  const activeRange = workspace.selectedNode.type === 'range'
    ? workspace.rangeOverrides[workspace.selectedNode.fileId]?.[workspace.selectedNode.rangeIndex]?.range
    : null;
  const selectedModel = useMemo(() => workspace.models.find((model) => model.fileId === selectedFileId), [selectedFileId, workspace.models]);
  const modelIds = useMemo(() => workspace.models.map((model) => model.fileId).join(','), [workspace.models]);


  useEffect(() => {
    if (workspace.models.length === 0) {
      setMeasurementActive(false);
      setMeasurementPoints([]);
    }
  }, [workspace.models.length]);

  useEffect(() => {
    setMeasurementPoints([]);
  }, [modelIds, workspace.positions, workspace.rotations, workspace.scales]);

  useEffect(() => {
    const onHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (isEditableShortcutTarget(event.target)) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        workspace.undo();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        workspace.redo();
      }
    };
    window.addEventListener('keydown', onHistoryShortcut);
    return () => window.removeEventListener('keydown', onHistoryShortcut);
  }, [workspace.redo, workspace.undo]);

  useEffect(() => {
    if (!mobileSettingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSettingsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileSettingsOpen]);

  const openFilePicker = () => fileInput.current?.click();
  const openProjectPicker = () => projectInput.current?.click();
  const receiveFiles = (files: FileList | null) => { if (files?.length) workspace.addModels(files); };

  return (
    <div className={`app-shell ${expandedViewer ? 'viewer-expanded' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); receiveFiles(event.dataTransfer.files); }}>
      <input ref={fileInput} hidden type="file" multiple accept=".stl,.step,.stp" onChange={(event) => { receiveFiles(event.target.files); event.target.value = ''; }} />
      <input ref={projectInput} hidden type="file" accept=".3mf" onChange={(event) => { const project = event.target.files?.[0]; if (project) void workspace.importProject(project); event.target.value = ''; }} />
      <header className="app-header">
        <div className="header-left"><div className="privacy-note"><ShieldCheck size={14} /> Session saved locally in browser storage</div><SupportLink /></div>
        <div className="header-history" aria-label="Edit history">
          <button className="icon-button" type="button" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={!workspace.canUndo} onClick={workspace.undo}><Undo2 size={16} /></button>
          <button className="icon-button" type="button" aria-label="Redo" title="Redo (Ctrl/Cmd+Y)" disabled={!workspace.canRedo} onClick={workspace.redo}><Redo2 size={16} /></button>
        </div>
        <div className="header-actions">
          <HeaderMoreMenu onAddModel={openFilePicker} onImportProject={openProjectPicker} onExportProject={() => void workspace.exportProject()} importingDisabled={workspace.projectBusy !== null} exportingDisabled={!workspace.models.length || workspace.projectBusy !== null} />
          <button className="button ghost danger" disabled={!workspace.models.length} onClick={workspace.clear}><Eraser size={15} /> Clear</button>
          {workspace.gcode && <a className="button secondary download" href={workspace.gcode.url} download={workspace.gcode.fileName}><Download size={15} /> Download</a>}
          {workspace.status === 'slicing' ? <button className="button danger" onClick={workspace.cancelSlice}><OctagonX size={15} /> Cancel</button> : <button className="button primary" disabled={!workspace.models.length || workspace.defaultsLoading} onClick={workspace.slice}><Slice size={15} /> Slice</button>}
        </div>
        <MobileActionsMenu
          onAddModel={openFilePicker}
          onImportProject={openProjectPicker}
          onExportProject={() => void workspace.exportProject()}
          onClear={workspace.clear}
          canClear={workspace.models.length > 0}
          importingDisabled={workspace.projectBusy !== null}
          exportingDisabled={!workspace.models.length || workspace.projectBusy !== null}
          download={workspace.gcode ? { href: workspace.gcode.url, fileName: workspace.gcode.fileName } : undefined}
        />
        <div className="mobile-navbar-actions">
          <button className="mobile-header-button" type="button" aria-label="Undo" disabled={!workspace.canUndo} onClick={workspace.undo}><Undo2 size={14} /></button>
          <button className="mobile-header-button" type="button" aria-label="Redo" disabled={!workspace.canRedo} onClick={workspace.redo}><Redo2 size={14} /></button>
          <button className="mobile-settings-trigger mobile-header-button" type="button" aria-label="Open objects and slicer settings" aria-expanded={mobileSettingsOpen} aria-controls="mobile-settings-panel" onClick={() => setMobileSettingsOpen(true)}><SlidersHorizontal size={14} /><span>Settings</span></button>
          {workspace.status === 'slicing'
            ? <button className="mobile-navbar-slice button danger" type="button" onClick={workspace.cancelSlice}><OctagonX size={14} /> Cancel</button>
            : <button className="mobile-navbar-slice button primary" type="button" disabled={!workspace.models.length || workspace.defaultsLoading} onClick={workspace.slice}><Slice size={14} /> Slice</button>}
        </div>
      </header>

      <button className={`mobile-settings-backdrop ${mobileSettingsOpen ? 'is-open' : ''}`} type="button" aria-label="Close objects and slicer settings" aria-hidden={!mobileSettingsOpen} tabIndex={mobileSettingsOpen ? 0 : -1} onClick={() => setMobileSettingsOpen(false)} />
      <div className="workspace-layout">
        <aside id="mobile-settings-panel" className={`sidebar ${mobileSettingsOpen ? 'mobile-settings-open' : ''}`} role={mobileSettingsOpen ? 'dialog' : undefined} aria-modal={mobileSettingsOpen ? 'true' : undefined} aria-label={mobileSettingsOpen ? 'Objects and slicer settings' : undefined}>
          <div className="mobile-settings-header"><span><SlidersHorizontal size={16} /><strong>Objects &amp; settings</strong></span><button className="icon-button" type="button" aria-label="Close objects and slicer settings" onClick={() => setMobileSettingsOpen(false)}><X size={18} /></button></div>
          <ObjectTree models={workspace.models} ranges={workspace.rangeOverrides} selected={workspace.selectedNode} selectedFileIds={workspace.selectedFileIds} modelNames={workspace.modelNames} placementIssues={workspace.placementIssues} onSelect={workspace.selectNode} onSelectFile={workspace.selectFile} onRename={workspace.renameModel} onArrange={workspace.autoArrange} onAddModels={openFilePicker} onRemoveModel={workspace.removeModel} onAddRange={workspace.addRange} onRemoveRange={workspace.removeRange} />
          <SlicerSettingsPanel selectedNode={workspace.selectedNode} config={workspace.config} fileOverrides={workspace.fileOverrides} rangeOverrides={workspace.rangeOverrides} onChange={workspace.setSetting} onApplyPrinterPreset={workspace.applyPrinterPreset} onRangeBoundary={workspace.setRangeBoundary} section={workspace.ui.settingsSection} query={workspace.ui.settingsQuery} onSectionChange={(settingsSection) => workspace.setUi((current) => ({ ...current, settingsSection }))} onQueryChange={(settingsQuery) => workspace.setUi((current) => ({ ...current, settingsQuery }))} highlightedFields={workspace.ui.aiHighlightedFields} onFieldInteract={workspace.clearAiFieldHighlight} />
          <AiPrefillPanel description={workspace.ui.prefillDescription} loading={workspace.prefilling || workspace.status === 'slicing'} onDescriptionChange={(prefillDescription) => workspace.setUi((current) => ({ ...current, prefillDescription }))} onPrefill={workspace.prefillSettings} />
        </aside>

        <main className={`work-area ${workspace.gcode ? 'with-gcode' : ''} ${expandedViewer ? `expanded-${expandedViewer}` : ''}`}>
          <section className="model-stage">
            {workspace.models.length ? (
              <ModelViewport ref={viewport} stlFiles={workspace.models} buildVolume={workspace.buildVolume} selectedFileId={selectedFileId} selectedFileIds={workspace.selectedFileIds} filePositions={workspace.positions} fileRotations={workspace.rotations} fileScales={workspace.scales} activeRange={activeRange} onSelectFile={workspace.selectFile} onSelectScene={workspace.selectScene} onDragStart={workspace.beginTransformChange} onPositionChange={(fileId, x, y) => workspace.setPositions((current) => ({ ...current, [fileId]: { x, y } }), false)} onGeometryBounds={workspace.setModelGeometryBounds} measurementActive={measurementActive} measurementPoints={measurementPoints} onMeasurementPoint={(point) => setMeasurementPoints((current) => addMeasurementPoint(current, point))} xray={workspace.ui.xrayModel} />
            ) : (
              <button className="empty-state" onClick={openFilePicker}><span><Box size={28} /></span><strong>Drop a model here</strong><p>Open an STL or STEP file to begin slicing.</p><em>Choose files</em></button>
            )}
            {workspace.models.length > 0 && <div className="axis-legend" aria-label="Viewport axes"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>}
            {workspace.models.length > 0 && <CameraPresetControls expanded={expandedViewer === 'model'} viewerLabel="model" xray={workspace.ui.xrayModel} onToggleXray={() => workspace.setUi((current) => ({ ...current, xrayModel: !current.xrayModel }))} onToggleExpanded={() => setExpandedViewer((current) => current === 'model' ? null : 'model')} onTop={() => viewport.current?.setCameraPreset('top')} onFront={() => viewport.current?.setCameraPreset('front')} onRight={() => viewport.current?.setCameraPreset('right')} onCenter={() => viewport.current?.setCameraPreset('center')} />}
            <div className="model-edit-controls">
              <MeasurementPanel active={measurementActive} disabled={workspace.models.length === 0} points={measurementPoints} onToggle={() => {
                if (measurementActive) setMeasurementPoints([]);
                setMeasurementActive((active) => !active);
              }} onClear={() => setMeasurementPoints([])} />
              {selectedModel && selectedFileId && <TransformPanel
                position={workspace.positions[selectedFileId] ?? { x: workspace.buildVolume.x / 2, y: workspace.buildVolume.y / 2 }}
                rotation={workspace.rotations[selectedFileId] ?? { x: 0, y: 0, z: 0 }}
                scale={workspace.scales[selectedFileId] ?? { x: 1, y: 1, z: 1 }}
                onPosition={(position) => workspace.setPositions((current) => ({ ...current, [selectedFileId]: position }))}
                onRotation={(rotation) => workspace.setRotations((current) => ({ ...current, [selectedFileId]: rotation }))}
                onScale={(scale) => workspace.setScales((current) => ({
                  ...current,
                  ...Object.fromEntries(workspace.selectedFileIds.map((fileId) => {
                    const prior = current[fileId] ?? { x: 1, y: 1, z: 1 };
                    return [fileId, {
                      x: Math.sign(prior.x) * Math.abs(scale.x),
                      y: Math.sign(prior.y) * Math.abs(scale.y),
                      z: Math.sign(prior.z) * Math.abs(scale.z),
                    }];
                  })),
                }))}
                onMirror={workspace.mirrorSelected}
                onDuplicate={workspace.duplicateSelected}
                onCenter={workspace.centerSelected}
                onLayFlat={() => {
                  const rotation = viewport.current?.layFlat(selectedFileId);
                  if (rotation) workspace.setRotations((current) => ({ ...current, [selectedFileId]: rotation }));
                }}
              />}
            </div>
            {workspace.status === 'slicing' && <div className="slicing-overlay"><LoaderCircle size={28} className="spin" /><strong>Slicer engine is working</strong><span>This request remains temporary.</span></div>}
          </section>
          {workspace.gcode && <GcodePreview result={workspace.gcode} buildVolume={workspace.buildVolume} enhancing={workspace.enhancing} onEnhance={workspace.enhanceGcode} ui={workspace.ui.gcodePreview} onUiChange={(gcodePreview) => workspace.setUi((current) => ({ ...current, gcodePreview }))} expanded={expandedViewer === 'gcode'} onToggleExpanded={() => setExpandedViewer((current) => current === 'gcode' ? null : 'gcode')} />}
        </main>
      </div>

      {workspace.projectNotice && <div className="project-notice" role="status"><span>{workspace.projectNotice}</span><button onClick={workspace.dismissProjectNotice}>Dismiss</button></div>}
      {workspace.error && <div className="error-toast"><OctagonX size={17} /><div><strong>Could not complete</strong><span>{workspace.error}</span></div><button onClick={workspace.dismissError}>Dismiss</button></div>}
      {dragging && <div className="drop-overlay"><FileUp size={34} /><strong>Drop models to add them</strong><span>STL, STEP, or STP</span></div>}
    </div>
  );
}
