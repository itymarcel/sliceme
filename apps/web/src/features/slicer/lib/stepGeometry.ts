import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

type OcctImportFactory = (moduleArg?: {
  locateFile?: (path: string) => string;
}) => Promise<OcctModule>;

type OcctModule = {
  ReadStepFile: (content: Uint8Array, params: StepImportParams | null) => StepImportResult;
};

type StepImportParams = {
  linearUnit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
  linearDeflectionType?: 'bounding_box_ratio' | 'absolute_value';
  linearDeflection?: number;
  angularDeflection?: number;
};

type StepImportResult = {
  success: boolean;
  meshes?: StepMesh[];
};

type StepMesh = {
  name?: string;
  attributes: {
    position: {
      array: number[];
    };
    normal?: {
      array: number[];
    };
  };
  index: {
    array: number[];
  };
};

const STEP_IMPORT_PARAMS: StepImportParams = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.0015,
  angularDeflection: 0.5,
};

let occtModulePromise: Promise<OcctModule> | null = null;

const getOcctModule = async (): Promise<OcctModule> => {
  if (!occtModulePromise) {
    occtModulePromise = (async () => {
      const importedFactory = await import('occt-import-js');
      const factory = ((importedFactory as unknown as { default?: OcctImportFactory }).default ??
        importedFactory) as unknown as OcctImportFactory;

      return factory({
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return occtWasmUrl;
          }
          return path;
        },
      });
    })();
  }

  return occtModulePromise;
};

const buildGeometryFromStepMesh = (mesh: StepMesh): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3),
  );

  if (mesh.attributes.normal?.array?.length) {
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3),
    );
  }

  geometry.setIndex(mesh.index.array);
  geometry.name = mesh.name ?? '';

  return geometry;
};

export const parseStepGeometry = async (fileBuffer: ArrayBuffer): Promise<THREE.BufferGeometry> => {
  const occt = await getOcctModule();
  const result = occt.ReadStepFile(new Uint8Array(fileBuffer), STEP_IMPORT_PARAMS);

  if (!result.success || !result.meshes?.length) {
    throw new Error('No valid geometries found in STEP file');
  }

  const geometries = result.meshes.map(buildGeometryFromStepMesh);
  const mergedGeometry =
    geometries.length === 1
      ? geometries[0]
      : BufferGeometryUtils.mergeGeometries(geometries);

  if (!mergedGeometry) {
    throw new Error('Could not merge STEP geometries');
  }

  if (!mergedGeometry.getAttribute('normal')) {
    mergedGeometry.computeVertexNormals();
  }

  mergedGeometry.computeBoundingBox();
  mergedGeometry.computeBoundingSphere();

  if (geometries.length > 1) {
    geometries.forEach((geometry) => {
      if (geometry !== mergedGeometry) {
        geometry.dispose();
      }
    });
  }

  return mergedGeometry;
};
