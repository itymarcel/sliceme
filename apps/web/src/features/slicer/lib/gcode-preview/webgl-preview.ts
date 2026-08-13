import { Parser, MoveCommand, Layer, SelectToolCommand } from './gcode-parser';
import {
  AmbientLight,
  AxesHelper,
  BufferGeometry,
  Color,
  ColorRepresentation,
  DirectionalLight,
  Euler,
  Float32BufferAttribute,
  Fog,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  PointLight,
  REVISION,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { GridHelper } from './gridHelper';
import { LineBox } from './lineBox';
import { LineTubeGeometry } from './LineTubeGeometry';
import { LinePoint } from './LinePoint';

export type DevModeOptions = {
  camera?: boolean | false;
  renderer?: boolean | false;
  parser?: boolean | false;
  buildVolume?: boolean | false;
  devHelpers?: boolean | false;
  statsContainer?: HTMLElement | undefined;
};

type RenderLayer = { extrusion: number[]; travel: number[]; z: number; height: number };
type GVector3 = {
  x: number;
  y: number;
  z: number;
};
type Arc = GVector3 & { r: number; i: number; j: number };

type Point = GVector3;
type BuildVolume = GVector3;
export class State {
  x!: number;
  y!: number;
  z!: number;
  r!: number;
  e!: number;
  i!: number;
  j!: number;
  t!: number; // tool index
  // feedrate?
  static get initial(): State {
    const state = new State();
    Object.assign(state, { x: 0, y: 0, z: 0, r: 0, e: 0, i: 0, j: 0, t: 0 });
    return state;
  }
}

export type GCodePreviewOptions = {
  buildVolume?: BuildVolume;
  backgroundColor?: ColorRepresentation;
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  debug?: boolean;
  endLayer?: number;
  extrusionColor?: ColorRepresentation | ColorRepresentation[];
  initialCameraPosition?: number[];
  lastSegmentColor?: ColorRepresentation;
  lineWidth?: number;
  lineHeight?: number;
  nonTravelMoves?: string[];
  minLayerThreshold?: number;
  renderExtrusion?: boolean;
  renderTravel?: boolean;
  startLayer?: number;
  topLayerColor?: ColorRepresentation;
  travelColor?: ColorRepresentation;
  toolColors?: Record<number, ColorRepresentation>;
  disableGradient?: boolean;
  extrusionWidth?: number;
  /** @experimental */
  renderTubes?: boolean;
  /**
   * @deprecated Please see the demo how to implement drag and drop.
   */
  allowDragNDrop?: boolean;
  /**
   * @deprecated Please use the `canvas` param instead.
   */
  targetId?: string;
  /** @experimental */
  devMode?: boolean | DevModeOptions;
};

const target = {
  h: 0,
  s: 0,
  l: 0
};

const isWorkerContext = typeof window === 'undefined';

export class WebGLPreview {
  minLayerThreshold = 0.05;
  parser: Parser;
  /**
   * @deprecated Please use the `canvas` param instead.
   */
  targetId?: string;
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  controls: OrbitControls | { update(): void; dispose(): void; enableDamping: boolean; dampingFactor: number; enableZoom: boolean; target: Vector3; addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void; };
  canvas: HTMLCanvasElement | OffscreenCanvas;
  renderExtrusion = true;
  renderTravel = false;
  renderTubes = false;
  toolpathVisible: (type: string | undefined) => boolean = () => true;
  extrusionWidth = 0.6;
  lineWidth?: number;
  lineHeight?: number;
  startLayer?: number;
  endLayer?: number;
  singleLayerMode = false;
  buildVolume?: BuildVolume;
  initialCameraPosition = [-100, 400, 450];
  /**
   * @deprecated Use the dev mode options instead.
   */
  debug = false;
  inches = false;
  nonTravelmoves: string[] = [];
  disableGradient = false;

  // gcode processing state
  private state: State = State.initial;
  private beyondFirstMove = false; // TODO: move to state

  // rendering
  private group?: Group;
  private disposables: { dispose(): void }[] = [];
  static readonly defaultExtrusionColor = new Color('hotpink');
  private _extrusionColor: Color | Color[] = WebGLPreview.defaultExtrusionColor;
  private animationFrameId?: number;
  private renderLayerIndex = 0;
  private _tubeLine?: LineTubeGeometry;
  private _tubeLastE = 0;
  private _eRelative = false; // false = M82 absolute (default), true = M83 relative
  private _needsRender = true;

  // colors
  private _backgroundColor = new Color(0xe0e0e0);
  private _travelColor = new Color(0x990000);
  private _topLayerColor?: Color;
  private _lastSegmentColor?: Color;
  private _toolColors: Record<number, Color> = {};

  // debug
  private devMode?: boolean | DevModeOptions = false;
  private _lastRenderTime = 0;
  private _wireframe = false;
  private stats?: Stats;
  private statsContainer?: HTMLElement;

  constructor(opts: GCodePreviewOptions) {
    this.minLayerThreshold = opts.minLayerThreshold ?? this.minLayerThreshold;
    this.parser = new Parser(this.minLayerThreshold);
    this.scene = new Scene();
    this.scene.background = this._backgroundColor;
    if (opts.backgroundColor !== undefined) {
      this.backgroundColor = new Color(opts.backgroundColor);
    }
    this.targetId = opts.targetId;
    this.endLayer = opts.endLayer;
    this.startLayer = opts.startLayer;
    this.lineWidth = opts.lineWidth;
    this.lineHeight = opts.lineHeight;
    this.buildVolume = opts.buildVolume;
    this.initialCameraPosition = opts.initialCameraPosition ?? this.initialCameraPosition;
    this.debug = opts.debug ?? this.debug;
    this.renderExtrusion = opts.renderExtrusion ?? this.renderExtrusion;
    this.renderTravel = opts.renderTravel ?? this.renderTravel;
    this.nonTravelmoves = opts.nonTravelMoves ?? this.nonTravelmoves;
    this.renderTubes = opts.renderTubes ?? this.renderTubes;
    this.extrusionWidth = opts.extrusionWidth ?? this.extrusionWidth;
    this.devMode = opts.devMode ?? this.devMode;
    this.stats = this.devMode ? new Stats() : undefined;

    if (opts.extrusionColor !== undefined) {
      this.extrusionColor = opts.extrusionColor;
    }
    if (opts.travelColor !== undefined) {
      this.travelColor = new Color(opts.travelColor);
    }
    if (opts.topLayerColor !== undefined) {
      this.topLayerColor = new Color(opts.topLayerColor);
    }
    if (opts.lastSegmentColor !== undefined) {
      this.lastSegmentColor = new Color(opts.lastSegmentColor);
    }
    if (opts.toolColors) {
      this._toolColors = {};
      for (const [key, value] of Object.entries(opts.toolColors)) {
        this._toolColors[parseInt(key)] = new Color(value);
      }
    }

    if (opts.disableGradient !== undefined) {
      this.disableGradient = opts.disableGradient;
    }

    console.info('Using THREE r' + REVISION);
    console.debug('opts', opts);

    if (this.targetId) {
      console.warn('`targetId` is deprecated and will removed in the future. Use `canvas` instead.');
    }

    if (!opts.canvas) {
      if (!this.targetId) {
        throw Error('Set either opts.canvas or opts.targetId');
      }
      const container = document.getElementById(this.targetId);
      if (!container) throw new Error('Unable to find element ' + this.targetId);

      this.renderer = new WebGLRenderer({ preserveDrawingBuffer: true });
      this.canvas = this.renderer.domElement;

      container.appendChild(this.canvas);
    } else {
      this.canvas = opts.canvas;
      this.renderer = new WebGLRenderer({
        canvas: this.canvas,
        preserveDrawingBuffer: true
      });
    }

    const _cw = (this.canvas as HTMLCanvasElement).offsetWidth || this.canvas.width;
    const _ch = (this.canvas as HTMLCanvasElement).offsetHeight || this.canvas.height;
    this.camera = new PerspectiveCamera(25, _cw / _ch, 10, 5000);
    this.camera.position.fromArray(this.initialCameraPosition);
    const fogFar = (this.camera as PerspectiveCamera).far;
    const fogNear = fogFar * 0.8;
    this.scene.fog = new Fog(this._backgroundColor, fogNear, fogFar);

    this.resize();

    if (isWorkerContext) {
      // Stub controls — no DOM interaction needed for off-thread thumbnail rendering
      const _target = new Vector3();
      this.controls = {
        update: () => {},
        dispose: () => {},
        enableDamping: false,
        dampingFactor: 0,
        enableZoom: false,
        target: _target,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    } else {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.addEventListener('change', () => { this._needsRender = true; });
    }
    this.initScene();
    if (!isWorkerContext) {
      this.animate();
    }

    if (opts.allowDragNDrop) this._enableDropHandler();

    this.initStats();
  }

  get extrusionColor(): Color | Color[] {
    return this._extrusionColor;
  }
  set extrusionColor(value: number | string | Color | ColorRepresentation[]) {
    if (Array.isArray(value)) {
      this._extrusionColor = [];
      // loop over the object and convert all colors to Color
      for (let index = 0; index < value.length; index++) {
        this._extrusionColor[index] = new Color(value[index]);
      }
      return;
    }
    this._extrusionColor = new Color(value);
  }

  // get tool color based on current state
  get currentToolColor(): Color {
    if (this._extrusionColor === undefined) {
      return WebGLPreview.defaultExtrusionColor;
    }
    if (this._extrusionColor instanceof Color) {
      return this._extrusionColor;
    }

    return this._extrusionColor[this.state.t] ?? WebGLPreview.defaultExtrusionColor;
  }

  get backgroundColor(): Color {
    return this._backgroundColor;
  }

  set backgroundColor(value: number | string | Color) {
    this._backgroundColor = new Color(value);
    this.scene.background = this._backgroundColor;
  }

  get travelColor(): Color {
    return this._travelColor;
  }
  set travelColor(value: number | string | Color) {
    this._travelColor = new Color(value);
  }

  get topLayerColor(): ColorRepresentation | undefined {
    return this._topLayerColor;
  }
  set topLayerColor(value: ColorRepresentation | undefined) {
    this._topLayerColor = value !== undefined ? new Color(value) : undefined;
  }

  get lastSegmentColor(): ColorRepresentation | undefined {
    return this._lastSegmentColor;
  }
  set lastSegmentColor(value: ColorRepresentation | undefined) {
    this._lastSegmentColor = value !== undefined ? new Color(value) : undefined;
  }

  /**
   * @internal Do not use externally.
   */
  get layers(): Layer[] {
    return [this.parser.preamble].concat(this.parser.layers.concat());
  }

  // convert from 1-based to 0-based
  get maxLayerIndex(): number {
    return (this.endLayer ?? this.layers.length) - 1;
  }

  // convert from 1-based to 0-based
  get minLayerIndex(): number {
    return this.singleLayerMode ? this.maxLayerIndex : (this.startLayer ?? 0) - 1;
  }

  /** @internal */
  animate(): void {
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    this.controls.update(); // must be called every frame for damping to work
    if (this._needsRender) {
      this.renderer.render(this.scene, this.camera);
      this._needsRender = false;
    }
    this.stats?.update();
  }

  /** Mark the scene as needing a re-render on the next animation frame. */
  public requestRender(): void {
    this._needsRender = true;
  }

  processGCode(gcode: string | string[]): void {
    this.parser.parseGCode(gcode);
    this.render();
  }

  private initScene() {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      if (disposable) disposable.dispose();
    }

    if (this.debug && this.buildVolume) {
      // show webgl axes
      const axesHelper = new AxesHelper(Math.max(this.buildVolume.x / 2, this.buildVolume.y / 2) + 20);
      this.scene.add(axesHelper);
    }

    if (this.buildVolume) {
      this.drawBuildVolume();
    }

    if (this.renderTubes) {
      console.warn('Volumetric rendering is experimental. It may not work as expected or change in the future.');
      const ambient = new AmbientLight(0xffffff, 1.2);

      // Key light: upper right front
      const keyLight = new DirectionalLight(0xffffff, 2.0);
      keyLight.position.set(1, 2, 1.5);

      // Fill light: upper left back
      const fillLight = new DirectionalLight(0xffffff, 0.8);
      fillLight.position.set(-1.5, 1, -1);

      // Rim light: below back for edge definition between layers
      const rimLight = new DirectionalLight(0xffffff, 0.4);
      rimLight.position.set(0, -1, -1);

      this.scene.add(ambient, keyLight, fillLight, rimLight);
    }
  }

  private createGroup(name: string): Group {
    const group = new Group();
    group.name = name;
    group.quaternion.setFromEuler(new Euler(-Math.PI / 2, 0, 0));
    if (this.buildVolume) {
      group.position.set(-this.buildVolume.x / 2, 0, this.buildVolume.y / 2);
    } else {
      // FIXME: this is just a very crude approximation for centering
      group.position.set(-100, 0, 100);
    }
    return group;
  }

  render(): void {
    const startRender = performance.now();
    this.group = this.createGroup('allLayers');
    this.state = State.initial;
    this._tubeLine = undefined;
    this._tubeLastE = 0;
    this._eRelative = false;
    this.initScene();

    for (let index = 0; index < this.layers.length; index++) {
      this.renderLayer(index);
    }

    this.finalizeTubes();

    this.scene.add(this.group);
    this.renderer.render(this.scene, this.camera);
    this._lastRenderTime = performance.now() - startRender;
  }

  // create a new render method to use an animation loop to render the layers incrementally
  /** @experimental */
  async renderAnimated(layerCount = 1): Promise<void> {
    this.initScene();

    this.renderLayerIndex = 0;
    return this.renderFrameLoop(layerCount > 0 ? layerCount : 1);
  }

  private renderFrameLoop(layerCount: number): Promise<void> {
    return new Promise((resolve) => {
      const loop = () => {
        if (this.renderLayerIndex > this.layers.length - 1) {
          resolve();
        } else {
          this.renderFrame(layerCount);
          requestAnimationFrame(loop);
        }
      };
      loop();
    });
  }

  private renderFrame(layerCount: number): void {
    this.group = this.createGroup('layer' + this.renderLayerIndex);

    for (let l = 0; l < layerCount && this.renderLayerIndex + l < this.layers.length; l++) {
      this.renderLayer(this.renderLayerIndex);
      this.renderLayerIndex++;
    }

    this.finalizeTubes();

    this.scene.add(this.group);
  }

  /**
   *  @internal
   */
  renderLayer(index: number): void {
    if (index > this.maxLayerIndex) return;
    const l = this.layers[index];

    const currentLayer: RenderLayer = {
      extrusion: [],
      travel: [],
      z: this.state.z,
      height: l.height
    };

    for (const cmd of l.commands) {
      if (cmd.gcode == 'g20') {
        this.setInches();
        continue;
      }

      if (cmd.gcode.startsWith('t')) {
        // flush render queue
        this.doRenderExtrusion(currentLayer, index);
        currentLayer.extrusion = [];

        const tool = cmd as SelectToolCommand;
        this.state.t = tool.toolIndex!;
        continue;
      }

      // M82/M83: switch between absolute and relative extrusion modes
      if (cmd.gcode === 'm82') { this._eRelative = false; continue; }
      if (cmd.gcode === 'm83') { this._eRelative = true; continue; }

      // G92: set position — in absolute mode, reset E tracker so ΔE stays accurate
      if (cmd.gcode === 'g92') {
        if (!this._eRelative && cmd.params.e !== undefined) {
          this._tubeLastE = cmd.params.e;
        }
        continue;
      }

      if (['g0', 'g00', 'g1', 'g01', 'g2', 'g02', 'g3', 'g03'].indexOf(cmd.gcode) > -1) {
        const g = cmd as MoveCommand;
        const next: State = {
          x: g.params.x ?? this.state.x,
          y: g.params.y ?? this.state.y,
          z: g.params.z ?? this.state.z,
          r: g.params.r ?? this.state.r,
          e: g.params.e ?? this.state.e,
          i: g.params.i ?? this.state.i,
          j: g.params.j ?? this.state.j,
          t: this.state.t
        };

        if (index >= this.minLayerIndex) {
          const extrude = (g.params.e ?? 0) > 0 || this.nonTravelmoves.indexOf(cmd.gcode) > -1;
          const moving = next.x != this.state.x || next.y != this.state.y || next.z != this.state.z;

          // E delta: relative mode → E param IS the delta; absolute → subtract last known E
          let eDelta: number;
          if (this._eRelative) {
            eDelta = g.params.e ?? 0;
          } else {
            const newE = g.params.e !== undefined ? g.params.e : this._tubeLastE;
            eDelta = newE - this._tubeLastE;
            this._tubeLastE = newE;
          }

          const toolpathVisible = this.toolpathVisible(cmd.toolpathType);
          if (moving && eDelta > 0 && this.renderTubes && this.renderExtrusion && toolpathVisible) {
            // Actual forward extrusion — radius = sqrt(ΔE / distance), matching gcode-viewer
            const p1 = new Vector3(this.state.x, this.state.y, this.state.z);
            const distance = p1.distanceTo(new Vector3(next.x, next.y, next.z));
            const radius = distance > 0 ? Math.sqrt(eDelta / distance) : 0;
            if (!this._tubeLine) {
              this._tubeLine = new LineTubeGeometry(8);
            }
            this._tubeLine.add(new LinePoint(p1, radius, this.currentToolColor.clone()));
          } else if (moving) {
            // Travel or retraction (eDelta ≤ 0): break the tube to prevent stray segments
            if (this.renderTubes && this._tubeLine) {
              this.finalizeTubes();
            }
            if ((extrude && this.renderExtrusion && toolpathVisible) || (!extrude && this.renderTravel)) {
              if (cmd.gcode == 'g2' || cmd.gcode == 'g3' || cmd.gcode == 'g02' || cmd.gcode == 'g03') {
                this.addArcSegment(currentLayer, this.state, next, extrude, cmd.gcode == 'g2' || cmd.gcode == 'g02');
              } else {
                this.addLineSegment(currentLayer, this.state, next, extrude);
              }
            }
          }
        }

        // update this.state
        this.state.x = next.x;
        this.state.y = next.y;
        this.state.z = next.z;
        if (!this.beyondFirstMove) this.beyondFirstMove = true;
      }
    }

    this.doRenderExtrusion(currentLayer, index);
  }

  /** @internal */
  doRenderExtrusion(layer: RenderLayer, index: number): void {
    if (this.renderExtrusion) {
      let extrusionColor = this.currentToolColor;

      if (!this.singleLayerMode && !this.renderTubes && !this.disableGradient) {
        const brightness = 0.1 + (0.7 * index) / this.layers.length;

        extrusionColor.getHSL(target);
        extrusionColor = new Color().setHSL(target.h, target.s, brightness);
      }

      if (!this.renderTubes) {
        if (index == this.layers.length - 1) {
          const layerColor = this._topLayerColor ?? extrusionColor;
          const lastSegmentColor = this._lastSegmentColor ?? layerColor;
          const endPoint = layer.extrusion.splice(-3);
          const preendPoint = layer.extrusion.splice(-3);
          this.addLine(layer.extrusion, layerColor.getHex());
          this.addLine([...preendPoint, ...endPoint], lastSegmentColor.getHex());
        } else {
          this.addLine(layer.extrusion, extrusionColor.getHex());
        }
      }
    }

    if (this.renderTravel) {
      this.addLine(layer.travel, this._travelColor.getHex());
    }
  }

  setInches(): void {
    if (this.beyondFirstMove) {
      console.warn('Switching units after movement is already made is discouraged and is not supported.');
      return;
    }
    this.inches = true;
  }

  /** @internal */
  drawBuildVolume(): void {
    if (!this.buildVolume) return;

    const grid = new GridHelper(this.buildVolume.x, 10, this.buildVolume.y, 10);
    grid.name = 'build-volume-grid';
    this.scene.add(grid);

    const geometryBox = LineBox(this.buildVolume.x, this.buildVolume.z, this.buildVolume.y, 0x888888);

    geometryBox.name = 'build-volume-bounds';
    geometryBox.position.setY(this.buildVolume.z / 2);
    this.scene.add(geometryBox);
  }

  // reset parser & processing state
  clear(): void {
    this.resetState();
    this.parser = new Parser(this.minLayerThreshold);
  }

  // reset processing state
  private resetState(): void {
    this.startLayer = 1;
    this.endLayer = Infinity;
    this.singleLayerMode = false;

    this.beyondFirstMove = false;
    this.state = State.initial;
    this._tubeLine = undefined;
    this._tubeLastE = 0;
    this._eRelative = false;
  }

  resize(): void {
    const w = (this.canvas as HTMLCanvasElement).offsetWidth || this.canvas.width;
    const h = (this.canvas as HTMLCanvasElement).offsetHeight || this.canvas.height;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio : 1);
    this.renderer.setSize(w, h, false);
  }

  /** @internal */
  addLineSegment(layer: RenderLayer, p1: Point, p2: Point, extrude: boolean): void {
    const line = extrude ? layer.extrusion : layer.travel;
    line.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  }

  /** @internal */
  addArcSegment(layer: RenderLayer, p1: Point, p2: Arc, extrude: boolean, cw: boolean): void {
    const line = extrude ? layer.extrusion : layer.travel;

    const currX = p1.x,
      currY = p1.y,
      currZ = p1.z,
      x = p2.x,
      y = p2.y,
      z = p2.z;
    let r = p2.r;

    let i = p2.i,
      j = p2.j;

    if (r) {
      // in r mode a minimum radius will be applied if the distance can otherwise not be bridged
      const deltaX = x - currX; // assume abs mode
      const deltaY = y - currY;

      // apply a minimal radius to bridge the distance
      const minR = Math.sqrt(Math.pow(deltaX / 2, 2) + Math.pow(deltaY / 2, 2));
      r = Math.max(r, minR);

      const dSquared = Math.pow(deltaX, 2) + Math.pow(deltaY, 2);
      const hSquared = Math.pow(r, 2) - dSquared / 4;
      // if (dSquared == 0 || hSquared < 0) {
      //   return { position: { x: x, y: z, z: y }, points: [] }; //we'll abort the render and move te position to the new position.
      // }
      let hDivD = Math.sqrt(hSquared / dSquared);

      // Ref RRF DoArcMove for details
      if ((cw && r < 0.0) || (!cw && r > 0.0)) {
        hDivD = -hDivD;
      }
      i = deltaX / 2 + deltaY * hDivD;
      j = deltaY / 2 - deltaX * hDivD;
      // } else {
      //     //the radial point is an offset from the current position
      //     ///Need at least on point
      //     if (i == 0 && j == 0) {
      //         return { position: { x: x, y: y, z: z }, points: [] }; //we'll abort the render and move te position to the new position.
      //     }
    }

    const wholeCircle = currX == x && currY == y;
    const centerX = currX + i;
    const centerY = currY + j;

    const arcRadius = Math.sqrt(i * i + j * j);
    const arcCurrentAngle = Math.atan2(-j, -i);
    const finalTheta = Math.atan2(y - centerY, x - centerX);

    let totalArc;
    if (wholeCircle) {
      totalArc = 2 * Math.PI;
    } else {
      totalArc = cw ? arcCurrentAngle - finalTheta : finalTheta - arcCurrentAngle;
      if (totalArc < 0.0) {
        totalArc += 2 * Math.PI;
      }
    }
    let totalSegments = (arcRadius * totalArc) / 1.8;
    if (this.inches) {
      totalSegments *= 25;
    }
    if (totalSegments < 1) {
      totalSegments = 1;
    }
    let arcAngleIncrement = totalArc / totalSegments;
    arcAngleIncrement *= cw ? -1 : 1;

    const points = [];

    points.push({ x: currX, y: currY, z: currZ });

    const zDist = currZ - z;
    const zStep = zDist / totalSegments;

    // get points for the arc
    let px = currX;
    let py = currY;
    let pz = currZ;
    // calculate segments
    let currentAngle = arcCurrentAngle;

    for (let moveIdx = 0; moveIdx < totalSegments - 1; moveIdx++) {
      currentAngle += arcAngleIncrement;
      px = centerX + arcRadius * Math.cos(currentAngle);
      py = centerY + arcRadius * Math.sin(currentAngle);
      pz += zStep;
      points.push({ x: px, y: py, z: pz });
    }

    points.push({ x: p2.x, y: p2.y, z: p2.z });

    for (let idx = 0; idx < points.length - 1; idx++) {
      line.push(points[idx].x, points[idx].y, points[idx].z, points[idx + 1].x, points[idx + 1].y, points[idx + 1].z);
    }
  }

  /** @internal */
  addLine(vertices: number[], color: number): void {
    if (typeof this.lineWidth === 'number' && this.lineWidth > 0) {
      this.addThickLine(vertices, color);
      return;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    this.disposables.push(geometry);
    const material = new LineBasicMaterial({ color: color });
    this.disposables.push(material);
    const lineSegments = new LineSegments(geometry, material);

    this.group?.add(lineSegments);
  }

  private finalizeTubes(): void {
    if (!this._tubeLine) return;
    if (this._tubeLine.pointsCount() < 2) {
      this._tubeLine.dispose();
      this._tubeLine = undefined;
      return;
    }
    this._tubeLine.finish();
    const material = new MeshPhongMaterial({ vertexColors: true, shininess: 75, specular: 0x555555 });
    this.disposables.push(material);
    this.disposables.push(this._tubeLine);
    const mesh = new Mesh(this._tubeLine, material);
    this.group?.add(mesh);
    this._tubeLine = undefined;
  }

  /** @internal */
  addThickLine(vertices: number[], color: number): void {
    if (!vertices.length || !this.lineWidth) return;

    const geometry = new LineSegmentsGeometry();
    this.disposables.push(geometry);

    const matLine = new LineMaterial({
      color: color,
      linewidth: this.lineWidth,
      resolution: new Vector2(this.canvas.width, this.canvas.height)
    });
    this.disposables.push(matLine);

    geometry.setPositions(vertices);
    const line = new LineSegments2(geometry, matLine);

    this.group?.add(line);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.controls.dispose();
    this.renderer.dispose();

    this.cancelAnimation();
  }

  // Call only when the canvas is permanently discarded (component unmount).
  // forceContextLoss fires asynchronously; calling it during intermediate
  // cleanup (e.g. effect re-runs) can kill a freshly-created renderer on the
  // same canvas element before it has a chance to render.
  forceContextLoss(): void {
    this.renderer.forceContextLoss();
  }

  private cancelAnimation(): void {
    if (this.animationFrameId !== undefined && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = undefined;
  }

  private _enableDropHandler() {
    console.warn('Drag and drop is deprecated as a library feature. See the demo how to implement your own.');
    const htmlCanvas = this.canvas as HTMLCanvasElement;
    htmlCanvas.addEventListener('dragover', (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      if ((evt as DragEvent).dataTransfer) (evt as DragEvent).dataTransfer!.dropEffect = 'copy';
      htmlCanvas.classList.add('dragging');
    });

    htmlCanvas.addEventListener('dragleave', (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      htmlCanvas.classList.remove('dragging');
    });

    htmlCanvas.addEventListener('drop', async (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      htmlCanvas.classList.remove('dragging');
      const files: FileList | [] = (evt as DragEvent).dataTransfer?.files ?? [];
      const file = files[0];

      this.clear();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this._readFromStream(file.stream() as unknown as ReadableStream<any>);
      this.render();
    });
  }


  /** @experimental  */
  async _readFromStream(stream: ReadableStream): Promise<void> {
    const reader = stream.getReader();
    let result;
    let tail = '';
    let size = 0;
    do {
      console.debug('reading from stream');
      result = await reader.read();
      size += result.value?.length ?? 0;
      const str = decode(result.value);
      const idxNewLine = str.lastIndexOf('\n');
      const maxFullLine = str.slice(0, idxNewLine);

      // parse increments but don't render yet
      this.parser.parseGCode(tail + maxFullLine);
      tail = str.slice(idxNewLine);
    } while (!result.done);
    console.debug('read from stream', size);
  }

  private initGui() {
    // DevGUI (lil-gui debug panel) removed — extend this if needed
  }

  private initStats() {
    if (this.stats) {
      if (typeof this.devMode === 'object') {
        this.statsContainer = this.devMode.statsContainer;
      }
      (this.statsContainer ?? document.body).appendChild(this.stats.dom);
      this.stats.dom.classList.add('stats');
      this.initGui();
    }
  }
}

function decode(uint8array: Uint8Array) {
  return new TextDecoder('utf-8').decode(uint8array);
}
