import { DoubleSide, FrontSide, type Side } from 'three';

export type ModelMaterialAppearance = {
  color: string;
  depthWrite: boolean;
  opacity: number;
  side: Side;
  transparent: boolean;
};

export function modelMaterialAppearance(selected: boolean, xray: boolean, modifier = false): ModelMaterialAppearance {
  return {
    color: modifier ? '#b56cff' : selected ? '#89ff8e' : '#8090a3',
    depthWrite: !xray && !modifier,
    opacity: modifier ? (selected ? 0.6 : 0.36) : xray ? 0.28 : 1,
    side: xray || modifier ? DoubleSide : FrontSide,
    transparent: xray || modifier,
  };
}
