import type { WorkspaceDocument } from './document.ts';

export function relatedEntityIds(document:WorkspaceDocument,shapeId:string):string[]{
 const shape=document.shapes.find(s=>s.id===shapeId);
 if(!shape)return [];
 const candidates=[shape.entityId,document.shapes.find(s=>s.id===shape.centerPointId)?.entityId,
  ...document.references.filter(r=>r.target.kind==='shape'&&r.target.id===shapeId).map(r=>document.parameters.find(p=>p.id===r.parameterId)?.ownerId)];
 return [...new Set(candidates.filter((id):id is string=>Boolean(id&&document.entities.some(e=>e.id===id))))];
}
export function relatedShapeIds(document:WorkspaceDocument,entityId:string):string[]{
 return document.shapes.filter(shape=>relatedEntityIds(document,shape.id).includes(entityId)).map(shape=>shape.id);
}
