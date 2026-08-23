import type {
  ConfigBundle,
  GcodeEnhancement,
  Position,
  RangeOverride,
  Rotation,
  Scale,
  SelectedNode,
  SlicerModel,
  WorkspaceUiState,
} from '../types';
import type { WorkspaceHistory } from './workspaceHistory';

const DATABASE_NAME = 'sliceme-workspace';
const DATABASE_VERSION = 1;
const CURRENT_WORKSPACE = 'current';

const WORKSPACE_STORE = 'workspace';
const MODEL_STORE = 'models';
const GCODE_STORE = 'gcode';

export type WorkspaceSnapshot = {
  version: 1;
  modelOrder: string[];
  config: ConfigBundle;
  fileOverrides: Record<string, Partial<ConfigBundle>>;
  rangeOverrides: Record<string, RangeOverride[]>;
  positions: Record<string, Position>;
  rotations: Record<string, Rotation>;
  scales: Record<string, Scale>;
  modelNames: Record<string, string>;
  startPositions: Record<string, Position>;
  selectedFileIds: string[];
  selectedNode: SelectedNode;
  ui: WorkspaceUiState;
  history?: WorkspaceHistory;
};

type StoredModel = {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  lastModified: number;
  blob: Blob;
  modifierFor?: string;
};

type StoredGcode = {
  id: typeof CURRENT_WORKSPACE;
  fileName: string;
  blob: Blob;
  enhancements: GcodeEnhancement[];
};

export type RestoredWorkspace = {
  snapshot: WorkspaceSnapshot | null;
  models: StoredModel[];
  gcode: Omit<StoredGcode, 'id'> | null;
};

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.addEventListener('success', () => resolve(request.result), { once: true });
  request.addEventListener('error', () => reject(request.error ?? new Error('Browser storage request failed')), { once: true });
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.addEventListener('complete', () => resolve(), { once: true });
  transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Browser storage transaction was aborted')), { once: true });
  transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Browser storage transaction failed')), { once: true });
});

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB is unavailable in this browser'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WORKSPACE_STORE)) database.createObjectStore(WORKSPACE_STORE);
      if (!database.objectStoreNames.contains(MODEL_STORE)) database.createObjectStore(MODEL_STORE, { keyPath: 'fileId' });
      if (!database.objectStoreNames.contains(GCODE_STORE)) database.createObjectStore(GCODE_STORE, { keyPath: 'id' });
    });
    request.addEventListener('success', () => {
      const database = request.result;
      database.addEventListener('versionchange', () => database.close());
      resolve(database);
    }, { once: true });
    request.addEventListener('error', () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open browser storage'));
    }, { once: true });
  });
  return databasePromise;
}

export async function loadPersistedWorkspace(): Promise<RestoredWorkspace> {
  const database = await openDatabase();
  const transaction = database.transaction([WORKSPACE_STORE, MODEL_STORE, GCODE_STORE], 'readonly');
  const snapshotRequest = transaction.objectStore(WORKSPACE_STORE).get(CURRENT_WORKSPACE) as IDBRequest<WorkspaceSnapshot | undefined>;
  const modelsRequest = transaction.objectStore(MODEL_STORE).getAll() as IDBRequest<StoredModel[]>;
  const gcodeRequest = transaction.objectStore(GCODE_STORE).get(CURRENT_WORKSPACE) as IDBRequest<StoredGcode | undefined>;
  const [snapshot, models, gcode] = await Promise.all([
    requestResult(snapshotRequest),
    requestResult(modelsRequest),
    requestResult(gcodeRequest),
    transactionDone(transaction),
  ]);
  return {
    snapshot: snapshot?.version === 1 ? snapshot : null,
    models,
    gcode: gcode ? { fileName: gcode.fileName, blob: gcode.blob, enhancements: gcode.enhancements ?? [] } : null,
  };
}

export async function persistWorkspace(snapshot: WorkspaceSnapshot) {
  const database = await openDatabase();
  const transaction = database.transaction(WORKSPACE_STORE, 'readwrite');
  transaction.objectStore(WORKSPACE_STORE).put(snapshot, CURRENT_WORKSPACE);
  await transactionDone(transaction);
}

export async function persistModels(models: SlicerModel[]) {
  const database = await openDatabase();
  const transaction = database.transaction(MODEL_STORE, 'readwrite');
  const store = transaction.objectStore(MODEL_STORE);
  store.clear();
  models.forEach((model) => store.put({
    fileId: model.fileId,
    fileName: model.fileName,
    fileSize: model.fileSize,
    fileType: model.file.type,
    lastModified: model.file.lastModified,
    blob: model.file,
    modifierFor: model.modifierFor,
  } satisfies StoredModel));
  await transactionDone(transaction);
}

export async function persistGcode(gcode: { fileName: string; blob: Blob; enhancements: GcodeEnhancement[] } | null) {
  const database = await openDatabase();
  const transaction = database.transaction(GCODE_STORE, 'readwrite');
  const store = transaction.objectStore(GCODE_STORE);
  if (gcode) store.put({ id: CURRENT_WORKSPACE, ...gcode } satisfies StoredGcode);
  else store.delete(CURRENT_WORKSPACE);
  await transactionDone(transaction);
}

export async function clearPersistedWorkspace() {
  const database = await openDatabase();
  const transaction = database.transaction([WORKSPACE_STORE, MODEL_STORE, GCODE_STORE], 'readwrite');
  transaction.objectStore(WORKSPACE_STORE).clear();
  transaction.objectStore(MODEL_STORE).clear();
  transaction.objectStore(GCODE_STORE).clear();
  await transactionDone(transaction);
}

export async function requestDurableStorage() {
  if (navigator.storage?.persist) await navigator.storage.persist();
}
