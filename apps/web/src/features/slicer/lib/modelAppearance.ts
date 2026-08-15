import { DoubleSide, FrontSide, type Side } from 'three';

export type ModelMaterialAppearance = {
  color: string;
  depthWrite: boolean;
  opacity: number;
  side: Side;
  transparent: boolean;
};

export function modelMaterialAppearance(selected: boolean, xray: boolean): ModelMaterialAppearance {
  return {
    color: selected ? '#89ff8e' : '#8090a3',
    depthWrite: !xray,
    opacity: xray ? 0.28 : 1,
    side: xray ? DoubleSide : FrontSide,
    transparent: xray,
  };
}
