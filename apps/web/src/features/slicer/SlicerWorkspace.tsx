import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Download, Eraser, FileUp, LoaderCircle, OctagonX, Scissors, ShieldCheck } from 'lucide-react';

import { GcodePreview } from './components/GcodePreview';
import { AiPrefillPanel } from './components/AiPrefillPanel';
import ModelViewport, { type ModelViewportHandle } from './components/ModelViewport';
import { CameraPresetControls } from './components/CameraPresetControls';
import { ObjectTree } from './components/ObjectTree';
import { SlicerSettingsPanel } from './components/SlicerSettingsPanel';
import { TransformPanel } from './components/TransformPanel';
import { MeasurementPanel } from './components/MeasurementPanel';
import { ProjectLinks } from './components/ProjectLinks';
import { useSlicerWorkspace } from './hooks/useSlicerWorkspace';
import { addMeasurementPoint, type MeasurementPoint } from './lib/measurement';

export function SlicerWorkspace() {
  const workspace = useSlicerWorkspace();
  const fileInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<ModelViewportHandle>(null);
  const [dragging, setDragging] = useState(false);
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
  }, [modelIds, workspace.positions, workspace.rotations]);

  const openFilePicker = () => fileInput.current?.click();
  const receiveFiles = (files: FileList | null) => { if (files?.length) workspace.addModels(files); };

  return (
    <div className="app-shell" onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); receiveFiles(event.dataTransfer.files); }}>
      <input ref={fileInput} hidden type="file" multiple accept=".stl,.step,.stp" onChange={(event) => { receiveFiles(event.target.files); event.target.value = ''; }} />
      <header className="app-header">
        <div className="privacy-note"><ShieldCheck size={14} /> Saved locally in this browser</div>
        <ProjectLinks />
        <div className="header-actions">
          <button className="button secondary" onClick={openFilePicker}><FileUp size={15} /> Add model</button>
          <button className="button ghost danger" disabled={!workspace.models.length} onClick={workspace.clear}><Eraser size={15} /> Clear</button>
          {workspace.status === 'slicing' ? <button className="button danger" onClick={workspace.cancelSlice}><OctagonX size={15} /> Cancel</button> : <button className="button primary" disabled={!workspace.models.length || workspace.defaultsLoading} onClick={workspace.slice}><Scissors size={15} /> Slice</button>}
          {workspace.gcode && <a className="button primary download" href={workspace.gcode.url} download={workspace.gcode.fileName}><Download size={15} /> Download</a>}
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="sidebar">
          <ObjectTree models={workspace.models} ranges={workspace.rangeOverrides} selected={workspace.selectedNode} onSelect={workspace.setSelectedNode} onAddModels={openFilePicker} onRemoveModel={workspace.removeModel} onAddRange={workspace.addRange} onRemoveRange={workspace.removeRange} />
          <SlicerSettingsPanel selectedNode={workspace.selectedNode} config={workspace.config} fileOverrides={workspace.fileOverrides} rangeOverrides={workspace.rangeOverrides} onChange={workspace.setSetting} onClear={workspace.clearSetting} onRangeBoundary={workspace.setRangeBoundary} section={workspace.ui.settingsSection} query={workspace.ui.settingsQuery} onSectionChange={(settingsSection) => workspace.setUi((current) => ({ ...current, settingsSection }))} onQueryChange={(settingsQuery) => workspace.setUi((current) => ({ ...current, settingsQuery }))} highlightedFields={workspace.ui.aiHighlightedFields} onFieldInteract={workspace.clearAiFieldHighlight} />
          <AiPrefillPanel description={workspace.ui.prefillDescription} loading={workspace.prefilling || workspace.status === 'slicing'} onDescriptionChange={(prefillDescription) => workspace.setUi((current) => ({ ...current, prefillDescription }))} onPrefill={workspace.prefillSettings} />
        </aside>

        <main className={`work-area ${workspace.gcode ? 'with-gcode' : ''}`}>
          <section className="model-stage">
            {workspace.models.length ? (
              <ModelViewport ref={viewport} stlFiles={workspace.models} buildVolume={workspace.buildVolume} selectedFileId={selectedFileId} filePositions={workspace.positions} fileRotations={workspace.rotations} activeRange={activeRange} onSelectFile={(fileId) => workspace.setSelectedNode({ type: 'file', fileId })} onSelectScene={() => workspace.setSelectedNode({ type: 'scene' })} onPositionChange={(fileId, x, y) => workspace.setPositions((current) => ({ ...current, [fileId]: { x, y } }))} measurementActive={measurementActive} measurementPoints={measurementPoints} onMeasurementPoint={(point) => setMeasurementPoints((current) => addMeasurementPoint(current, point))} />
            ) : (
              <button className="empty-state" onClick={openFilePicker}><span><Box size={28} /></span><strong>Drop a model here</strong><p>Open an STL or STEP file to begin slicing.</p><em>Choose files</em></button>
            )}
            {workspace.models.length > 0 && <div className="axis-legend" aria-label="Viewport axes"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>}
            {workspace.models.length > 0 && <CameraPresetControls onTop={() => viewport.current?.setCameraPreset('top')} onFront={() => viewport.current?.setCameraPreset('front')} onRight={() => viewport.current?.setCameraPreset('right')} onCenter={() => viewport.current?.setCameraPreset('center')} />}
            <MeasurementPanel active={measurementActive} disabled={workspace.models.length === 0} points={measurementPoints} onToggle={() => {
              if (measurementActive) setMeasurementPoints([]);
              setMeasurementActive((active) => !active);
            }} onClear={() => setMeasurementPoints([])} />
            {selectedModel && selectedFileId && <TransformPanel position={workspace.positions[selectedFileId] ?? { x: workspace.buildVolume.x / 2, y: workspace.buildVolume.y / 2 }} rotation={workspace.rotations[selectedFileId] ?? { x: 0, y: 0, z: 0 }} onPosition={(position) => workspace.setPositions((current) => ({ ...current, [selectedFileId]: position }))} onRotation={(rotation) => workspace.setRotations((current) => ({ ...current, [selectedFileId]: rotation }))} />}
            {workspace.status === 'slicing' && <div className="slicing-overlay"><LoaderCircle size={28} className="spin" /><strong>OrcaSlicer is working</strong><span>This request remains temporary.</span></div>}
          </section>
          {workspace.gcode && <GcodePreview result={workspace.gcode} buildVolume={workspace.buildVolume} enhancing={workspace.enhancing} onEnhance={workspace.enhanceGcode} ui={workspace.ui.gcodePreview} onUiChange={(gcodePreview) => workspace.setUi((current) => ({ ...current, gcodePreview }))} />}
        </main>
      </div>

      {workspace.error && <div className="error-toast"><OctagonX size={17} /><div><strong>Could not complete</strong><span>{workspace.error}</span></div><button onClick={workspace.dismissError}>Dismiss</button></div>}
      {dragging && <div className="drop-overlay"><FileUp size={34} /><strong>Drop models to add them</strong><span>STL, STEP, or STP</span></div>}
    </div>
  );
}
