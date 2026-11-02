import { geometryLabels, geometryValue, shapeProperties, validateGeometry } from './geometry.ts';
import { readParameterValue } from '../engine/calculations.ts';
import type { ParameterReference, SceneShape, WorkspaceDocument, WorkspaceParameter, WorkspaceEntity } from './document.ts';

export type ParameterTarget = ParameterReference['target'];
export type ParameterReading =
  | { status: 'unbound' }
  | { status: 'missing'; reference: ParameterReference }
  | { status: 'error'; reference: ParameterReference; message: string }
  | { status: 'resolved'; reference: ParameterReference; parameter: WorkspaceParameter };

export function readTargetParameter(document: WorkspaceDocument, target: ParameterTarget): ParameterReading {
  const reference = document.references.find(item => item.target.kind === target.kind && item.target.id === target.id && (target.kind !== 'shape' || (item.target.property ?? 'radius') === (target.property ?? 'radius')));
  if (!reference) return { status: 'unbound' };
  const parameter = document.parameters.find(item => item.id === reference.parameterId);
  if (!parameter) return { status: 'missing', reference };
  const result = readParameterValue(document, parameter.id);
  if (result.status === 'error') return { status: 'error', reference, message: result.message };
  return { status: 'resolved', reference, parameter: { ...parameter, value: result.value as number } };
}

export function readCircleRadius(document: WorkspaceDocument, shape: SceneShape): { radius: number | null; message?: string } {
  const reading = readTargetParameter(document, { kind: 'shape', id: shape.id });
  if (reading.status === 'error') return { radius: null, message: reading.message };
  if (reading.status === 'missing') return { radius: null, message: 'Источник радиуса удалён. Выберите параметр.' };
  const radius = reading.status === 'resolved' ? reading.parameter.value : shape.radius;
  if (!Number.isFinite(radius) || radius <= 0) return { radius: null, message: 'Радиус должен быть больше 0. Измените значение или источник.' };
  return { radius };
}

export type PointEntityReading =
  | { status: 'unbound' }
  | { status: 'missing' }
  | { status: 'resolved'; entity: WorkspaceEntity };

export function readPointEntity(document: WorkspaceDocument, point: SceneShape): PointEntityReading {
  if (!point.entityId) return { status: 'unbound' };
  const entity = document.entities.find(item => item.id === point.entityId);
  return entity ? { status: 'resolved', entity } : { status: 'missing' };
}

export function readCircleCenter(document: WorkspaceDocument, circle: SceneShape): { position: { x: number; y: number } | null; message?: string } {
  if (!circle.centerPointId) return { position: { x: circle.x, y: circle.y } };
  const point = document.shapes.find(shape => shape.id === circle.centerPointId && shape.kind === 'point');
  if (!point) return { position: null, message: 'Точка центра удалена. Выберите другую точку или снимите привязку.' };
  return { position: { x: point.x, y: point.y } };
}

export function readShapeGeometry(document:WorkspaceDocument,shape:SceneShape):{shape:SceneShape;message?:string} {
 const resolved={...shape};
 for(const property of shapeProperties(shape.kind)) {
  const reading=readTargetParameter(document,{kind:'shape',id:shape.id,property});
  if(reading.status==='missing')return {shape:resolved,message:`${geometryLabels[property]}: источник удалён.`};
  if(reading.status==='error')return {shape:resolved,message:reading.message};
  resolved[property]=reading.status==='resolved'?reading.parameter.value:geometryValue(shape,property);
 }
 try { validateGeometry(resolved);return {shape:resolved}; }catch(error){return {shape:resolved,message:error instanceof Error?error.message:'Некорректная геометрия.'};}
}
