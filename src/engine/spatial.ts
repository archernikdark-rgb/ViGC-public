import { CalculationError } from './expression.ts';
import {shapeProperties,validateGeometry} from '../workspace/geometry.ts';
import {anchorPosition,containsPoint,traceShapes} from './scene-geometry.ts';
import type {Point,TraceHit} from './scene-geometry.ts';
import type { WorkspaceDocument,SceneShape } from '../workspace/document.ts';
export const spatialLabels={position:'Положение',distance:'Расстояние',direction:'Направление',inside:'Присутствие в области',nearest:'Ближайший объект',raycast:'Перекрытие',trace:'Проверка лучом'} as const;
export interface SpatialDefinition { operation: keyof typeof spatialLabels; originId: string; targetId?: string; groupId?: string; originAnchor?:string;targetAnchor?:string; angle?:number;range?:number;stopMode?:'first'|'object'|'group';stopId?:string;stopGroupId?:string;output?:'blocked'|'count'|'distance'|'point'; }
export function spatialScene(document:WorkspaceDocument,readParameter:(id:string)=>unknown):SceneShape[]{
 return document.shapes.map(source=>{const shape={...source};for(const p of shapeProperties(shape.kind)){const ref=document.references.find(r=>r.target.kind==='shape'&&r.target.id===shape.id&&(r.target.property??'radius')===p);if(ref){const v=readParameter(ref.parameterId);if(typeof v!=='number')throw new CalculationError('spatial','Геометрии нужен числовой источник.');shape[p]=v;}}if(shape.centerPointId){const point=document.shapes.find(s=>s.id===shape.centerPointId);if(!point)throw new CalculationError('spatial','Точка центра удалена.');shape.x=point.x;shape.y=point.y;}return shape;});
}
export function spatialTrace(document:WorkspaceDocument,d:SpatialDefinition,readParameter:(id:string)=>unknown):{from:Point;to:Point;hits:TraceHit[];stopped:boolean}{
 const shapes=spatialScene(document,readParameter),origin=shapes.find(s=>s.id===d.originId);if(!origin)throw new CalculationError('spatial','Выберите начало проверки.');
 const from=anchorPosition(origin,d.originAnchor),target=shapes.find(s=>s.id===d.targetId);
 let to:Point;
 if(d.operation==='trace'){const range=d.range??1000,angle=(d.angle??0)*Math.PI/180;if(!Number.isFinite(range)||range<=0||range>1e9||!Number.isFinite(angle))throw new CalculationError('spatial','Укажите положительную конечную дальность и направление.');to={x:from.x+Math.cos(angle)*range,y:from.y+Math.sin(angle)*range};}
 else {if(!target)throw new CalculationError('spatial','Выберите цель проверки.');to=anchorPosition(target,d.targetAnchor);}
 const group=document.sceneGroups.find(g=>g.id===d.groupId);if(!group)throw new CalculationError('spatial','Выберите группу проверяемых объектов.');
 const groupIds=new Set(group.shapeIds),visited=new Set([group.id]);let changed=true;while(changed){changed=false;for(const child of document.sceneGroups)if(child.parentId&&visited.has(child.parentId)&&!visited.has(child.id)){visited.add(child.id);child.shapeIds.forEach(id=>groupIds.add(id));changed=true;}}
 const candidates=shapes.filter(s=>groupIds.has(s.id)&&s.id!==origin.id&&(d.operation==='trace'||s.id!==target?.id));for(const s of candidates)validateGeometry(s);
 let hits=traceShapes(candidates,from,to),stopped=false;
 if(d.operation==='trace'){
  const stopGroup=d.stopMode==='group'?document.sceneGroups.find(g=>g.id===d.stopGroupId):undefined;
  if(d.stopMode==='object'&&!shapes.some(s=>s.id===d.stopId))throw new CalculationError('spatial','Выберите объект остановки.');
  if(d.stopMode==='group'&&!stopGroup)throw new CalculationError('spatial','Выберите группу остановки.');
  const index=hits.findIndex(h=>d.stopMode==='object'?h.shapeId===d.stopId:d.stopMode==='group'?stopGroup!.shapeIds.includes(h.shapeId):true);
  if(index>=0){hits=hits.slice(0,index+1);to=hits[index].point;stopped=true;}
 }
 return {from,to,hits,stopped};
}
export function spatialValue(document: WorkspaceDocument, d: SpatialDefinition, readParameter: (id: string) => unknown): number | boolean | number[] {
 const shapes=spatialScene(document,readParameter);
 const shape=(id?:string)=>{const s=shapes.find(s=>s.id===id);if(!s)throw new CalculationError('spatial','Объект удалён или не выбран.');return s;};
 const a=anchorPosition(shape(d.originId),d.originAnchor);
 if(d.operation==='position')return [a.x,a.y];
 if(d.operation==='raycast'||d.operation==='trace'){
  const trace=spatialTrace(document,d,readParameter),hit=trace.hits.at(-1);
  if(d.output==='count')return trace.hits.length;
  if(d.output==='distance'){if(!hit)throw new CalculationError('spatial','Попаданий нет: расстояние не определено.');return hit.distance;}
  if(d.output==='point'){if(!hit)throw new CalculationError('spatial','Попаданий нет: точка не определена.');return [hit.point.x,hit.point.y];}
  return trace.hits.length>0;
 }
 if(d.operation==='nearest') {const group=document.sceneGroups.find(g=>g.id===d.groupId);if(!group)throw new CalculationError('spatial','Выберите группу.');const members=shapes.filter(s=>s.id!==d.originId&&group.shapeIds.includes(s.id)).sort((l,r)=>Math.hypot(l.x-a.x,l.y-a.y)-Math.hypot(r.x-a.x,r.y-a.y));if(!members.length)throw new CalculationError('spatial','В группе нет другого объекта.');const p=anchorPosition(members[0]);return [p.x,p.y];}
 const target=shape(d.targetId),b=anchorPosition(target,d.targetAnchor),dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy);
 if(!Number.isFinite(distance))throw new CalculationError('spatial','Расстояние выходит за числовой диапазон.');
 if(d.operation==='inside'){validateGeometry(target);if(!['circle','rectangle','polygon','chart'].includes(target.kind))throw new CalculationError('spatial','Выберите область: круг, прямоугольник, многоугольник или чарт.');return containsPoint(target,a);}
 if(d.operation==='distance')return distance;
 return distance===0?[0,0]:[dx/distance,dy/distance];
}
