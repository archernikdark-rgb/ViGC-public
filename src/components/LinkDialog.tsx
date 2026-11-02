import { useEffect, useRef, useState } from 'react';
import type { ShapeKind, WorkspaceCommand, WorkspaceDocument } from '../workspace/document.ts';
import { shapeLabels, shapeProperties, geometryLabels } from '../workspace/geometry.ts';
import type { ShapeProperty } from '../workspace/geometry.ts';
export interface LinkRequest {kind:'entity'|'parameter';id:string;shapeId?:string;position?:{x:number;y:number}}
export function LinkDialog({request,document,onCommand,onClose,onLinked}:{request:LinkRequest;document:WorkspaceDocument;onCommand:(command:WorkspaceCommand)=>void;onClose:()=>void;onLinked:(id:string)=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const parameter=request.kind==='parameter'?document.parameters.find(p=>p.id===request.id):undefined;
 const entity=document.entities.find(e=>e.id===(parameter?.ownerId??request.id));
 const [target,setTarget]=useState(request.shapeId??'new');
 const [kind,setKind]=useState<ShapeKind>('circle');
 const [property,setProperty]=useState<ShapeProperty>('radius');
 const shape=document.shapes.find(s=>s.id===target);
 const properties=shapeProperties(shape?.kind??kind);
 const chosen=properties.includes(property)?property:properties[0];
 useEffect(()=>{dialog.current?.showModal();return ()=>dialog.current?.close();},[]);
 return <dialog ref={dialog} className="link-dialog" onCancel={onClose}><form onSubmit={e=>{e.preventDefault();if(!entity)return;const shapeId=shape?.id??crypto.randomUUID();onCommand({type:'object.link',shapeId,...(!shape?{create:{kind,position:request.position??{x:240,y:230}}}:{}),entityId:entity.id,...(parameter?{parameterId:parameter.id,property:chosen}:{})});onLinked(shapeId);onClose();}}><div className="section-heading"><h2>{parameter?`${entity?.name} / ${parameter.name}`:entity?.name}</h2><span className="header-spacer"/><button type="button" className="icon-button" aria-label="Закрыть связывание" onClick={onClose}>×</button></div>
 <label className="field">Объект<select autoFocus value={target} onChange={e=>setTarget(e.target.value)}><option value="new">Создать новый</option>{document.shapes.filter(s=>!['comment','text','value'].includes(s.kind)).map(s=><option key={s.id} value={s.id} disabled={Boolean(s.entityId&&s.entityId!==entity?.id&&document.entities.some(e=>e.id===s.entityId))}>{s.name}</option>)}</select></label>
 {!shape&&<label className="field">Фигура<select value={kind} onChange={e=>setKind(e.target.value as ShapeKind)}>{(['point','circle','rectangle','polygon','chart','arrow'] as const).map(k=><option key={k} value={k}>{shapeLabels[k]}</option>)}</select></label>}
 {parameter&&<label className="field">Свойство<select value={chosen} onChange={e=>setProperty(e.target.value as ShapeProperty)}>{properties.map(p=><option key={p} value={p}>{geometryLabels[p]}</option>)}</select></label>}
 <div className="dialog-actions"><button type="button" onClick={onClose}>Отмена</button><button className="primary" disabled={!entity}>Связать</button></div></form></dialog>;
}
