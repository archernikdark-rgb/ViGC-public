import type { SceneShape, WorkspaceDocument } from './document.ts';
export interface LayerEntry {kind:'shape'|'group';id:string;rank:number}
export function layerEntries(document:WorkspaceDocument,parentId?:string):LayerEntry[] {
 // Value cards live in the canvas overlay and are not part of the drawable layer stack.
 const layerShapes=document.shapes.filter(shape=>shape.kind!=='value');
 const indexes=new Map(layerShapes.map((shape,index)=>[shape.id,index]));
 function rank(id:string,seen=new Set<string>()):number {
  if(seen.has(id))return -1;seen.add(id);
  const group=document.sceneGroups.find(g=>g.id===id);if(!group)return -1;
  return Math.max(-1,...group.shapeIds.map(id=>indexes.get(id)??-1),...document.sceneGroups.filter(g=>g.parentId===id).map(g=>rank(g.id,new Set(seen))));
 }
 const shapeIds=parentId?document.sceneGroups.find(g=>g.id===parentId)?.shapeIds.filter(id=>layerShapes.some(shape=>shape.id===id))??[]:layerShapes.filter(s=>!document.sceneGroups.some(g=>g.shapeIds.includes(s.id))).map(s=>s.id);
 return [...shapeIds.map(id=>({kind:'shape' as const,id,rank:indexes.get(id)??-1})),...document.sceneGroups.filter(g=>g.parentId===parentId).map(g=>({kind:'group' as const,id:g.id,rank:rank(g.id)}))].sort((a,b)=>b.rank-a.rank);
}
export function normalizeLayerOrder(document:WorkspaceDocument):SceneShape[] {
 const visited=new Set<string>();
 function flatten(parentId?:string):string[]{return layerEntries(document,parentId).toReversed().flatMap(entry=>{const key=`${entry.kind}:${entry.id}`;if(visited.has(key))return [];visited.add(key);return entry.kind==='shape'?[entry.id]:flatten(entry.id);});}
 return [...flatten().map(id=>document.shapes.find(s=>s.id===id)!),...document.shapes.filter(shape=>shape.kind==='value')];
}
