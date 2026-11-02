import { relatedEntityIds, relatedShapeIds } from '../workspace/related-objects.ts';
import { layerEntries } from '../workspace/layers.ts';
import { useEffect, useRef, useState } from 'react';
import { EntityTreeEditor, InlineName } from './EntityTreeEditor.tsx';
import { CommonParametersDialog } from './CommonParametersDialog.tsx';
import { commonParameterGroups } from '../workspace/common-parameters.ts';
import type { DragEvent, MouseEvent } from 'react';
import type { WorkspaceCommand, WorkspaceDocument } from '../workspace/document.ts';
import { Icon, IconButton } from './Icon.tsx';
import { geometryLabels } from '../workspace/geometry.ts';
import { readParameterValue } from '../engine/calculations.ts';
export type WorkspaceSelection={kind:'shapes'|'entities'|'logic'|'groups';ids:string[]};
export type DragItem={kind:'shape'|'entity'|'parameter'|'group';id:string};
export const dragFormat='application/x-vigc-item';
export function readDrag(event:DragEvent):DragItem|null {
 try {const item=JSON.parse(event.dataTransfer.getData(dragFormat));return ['shape','entity','parameter','group'].includes(item.kind)&&typeof item.id==='string'?item:null;}catch{return null;}
}
export function startDrag(event:DragEvent,item:DragItem){event.stopPropagation();event.dataTransfer.setData(dragFormat,JSON.stringify(item));event.dataTransfer.effectAllowed='copyMove';}
export function ContentTree({document,sourceDocument,selection,onSelect,onCommand,onDebugValue,onLink,showEntities,showLayers,showEvents,highlightContext,onHighlightContext,readOnlyValues,debugValues=false}:{highlightContext:string|null;onHighlightContext:(id:string|null)=>void;showEntities:number;showLayers:number;showEvents:number;readOnlyValues:boolean;debugValues?:boolean;document:WorkspaceDocument;sourceDocument:WorkspaceDocument;selection:WorkspaceSelection;onSelect:(selection:WorkspaceSelection)=>void;onCommand:(command:WorkspaceCommand)=>void;onDebugValue:(id:string,value:number)=>void;onLink:(kind:'entity'|'parameter',id:string,shapeId?:string)=>void}) {
 const treeRef=useRef<HTMLDivElement>(null);
 const [navigation,setNavigation]=useState(0);
 function navigate(kind:'shapes'|'entities',ids:string[]){setTab(kind==='shapes'?'layers':'entities');onSelect({kind,ids});setNavigation(n=>n+1);}
 useEffect(()=>{if(!navigation)return;const selected=treeRef.current?.querySelector('.tree-drop-root .selected');if(!selected)return;let parent=selected.parentElement;while(parent&&parent!==treeRef.current){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}selected.scrollIntoView({block:'nearest'});},[navigation]);
 const [tab,setTab]=useState<'layers'|'entities'|'events'>('events');
 const [entityMenu,setEntityMenu]=useState<{x:number;y:number;ids:string[]}|null>(null);
 const [editingCommon,setEditingCommon]=useState<string[]|null>(null);
 useEffect(()=>{if(showEntities) setTab('entities');},[showEntities]);
 useEffect(()=>{if(showLayers) setTab('layers');},[showLayers]);
 useEffect(()=>{if(showEvents) setTab('events');},[showEvents]);
 useEffect(()=>{if(!entityMenu)return;const dismiss=(event:globalThis.PointerEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.entity-context-menu'))setEntityMenu(null);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setEntityMenu(null);};window.addEventListener('pointerdown',dismiss);window.addEventListener('keydown',escape);return()=>{window.removeEventListener('pointerdown',dismiss);window.removeEventListener('keydown',escape);};},[entityMenu]);
 function select(kind:WorkspaceSelection['kind'],id:string,event?:MouseEvent) {
  const multiple=event&&(event.shiftKey||event.metaKey||event.ctrlKey);
  onSelect({kind,ids:multiple&&selection.kind===kind?selection.ids.includes(id)?selection.ids.filter(i=>i!==id):[...selection.ids,id]:[id]});
 }
 function dropRoot(event:DragEvent){event.preventDefault();const item=readDrag(event);if(!item)return;
  if(tab==='entities'&&item.kind==='entity')onCommand({type:'entity.reparent',ids:selection.kind==='entities'&&selection.ids.includes(item.id)?selection.ids:[item.id],parentId:null});
  if(tab==='layers'&&(item.kind==='shape'||item.kind==='group'))onCommand({type:'scene.organize',shapeIds:item.kind==='shape'?[item.id]:[],groupIds:item.kind==='group'?[item.id]:[],parentId:null});
 }
 function entityRow(id:string,ancestors:string[]=[],includeChildren=true):React.ReactNode {
  const entity=document.entities.find(e=>e.id===id);if(!entity||ancestors.includes(id))return null;
  return <details key={id} className="layer-branch" open><summary onContextMenu={e=>{e.preventDefault();e.stopPropagation();const ids=selection.kind==='entities'&&selection.ids.includes(id)?selection.ids:[id];onSelect({kind:'entities',ids});setEntityMenu({ids,x:Math.max(8,Math.min(e.clientX,window.innerWidth-220)),y:Math.max(8,Math.min(e.clientY,window.innerHeight-150))});}} draggable onDragStart={e=>startDrag(e,{kind:'entity',id})} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();const item=readDrag(e);if(item?.kind==='entity')onCommand({type:'entity.reparent',ids:selection.kind==='entities'&&selection.ids.includes(item.id)?selection.ids:[item.id],parentId:id});}}><span className="tree-drag-handle" title="Перетащить участника" draggable onDragStart={e=>startDrag(e,{kind:'entity',id})}><Icon name={entity.folder?'folder':'person'}/></span><span className={`entity-title ${document.logic.nodes.some(n=>n.id===highlightContext&&n.data.contextEntityIds?.includes(id))?'context-highlight':''} ${selection.kind==='entities'&&selection.ids.includes(id)?'selected':''}`} onClick={e=>{e.preventDefault();select('entities',id,e);}}><InlineName value={entity.name} label="Имя сущности" onChange={name=>onCommand({type:'entity.rename',id,name})}/></span>{!entity.folder&&<span className="entity-header-tools" onClick={e=>{e.preventDefault();e.stopPropagation();}}><button className="icon-button" title="Показывать имя сущности" aria-label={`Показывать имя: ${entity.name}`} aria-pressed={entity.labelVisible!==false} onClick={()=>onCommand({type:'entity.visibility',id,visible:entity.labelVisible===false})}><Icon name={entity.labelVisible===false?'eyeOff':'eye'}/></button><IconButton icon="plus" label={`Добавить параметр: ${entity.name}`} onClick={()=>onCommand({type:'parameter.add',parameter:{id:crypto.randomUUID(),ownerId:id,name:`Параметр ${document.parameters.filter(p=>p.ownerId===id).length+1}`,value:0}})}/><IconButton icon="link" label={`Связать сущность: ${entity.name}`} onClick={()=>onLink('entity',id)}/></span>}</summary>
   <div className="layer-children">{relatedShapeIds(document,id).length>0&&<button className="tree-related-link" onClick={()=>navigate('shapes',relatedShapeIds(document,id))}>Связанные фигуры · {relatedShapeIds(document,id).length} →</button>}<EntityTreeEditor readOnly={readOnlyValues} debugValues={debugValues} document={document} id={id} onCommand={onCommand} onDebugValue={onDebugValue} onLink={onLink}/>{document.logic.nodes.filter(n=>n.data.role==='context'&&n.data.contextEntityIds?.includes(id)).map(n=><button key={n.id} className={`context-tag ${highlightContext===n.id?'active':''}`} aria-pressed={highlightContext===n.id} onClick={()=>onHighlightContext(highlightContext===n.id?null:n.id)}>{n.data.label}</button>)}{includeChildren&&document.entities.filter(e=>e.parentId===id).map(e=>entityRow(e.id,[...ancestors,id]))}</div>
  </details>;
 }
 function shapeRow(id:string):React.ReactNode {
  const shape=document.shapes.find(s=>s.id===id);if(!shape)return null;
  const entities=relatedEntityIds(document,id).map(entityId=>document.entities.find(e=>e.id===entityId)!);
  const references=document.references.filter(r=>r.target.kind==='shape'&&r.target.id===id);
  return <details open className="layer-branch" key={id}><summary draggable onDragStart={e=>startDrag(e,{kind:'shape',id})} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();const item=readDrag(e);if(item?.kind==='shape'){onCommand({type:'scene.order',id:item.id,beforeId:id,parentId:document.sceneGroups.find(g=>g.shapeIds.includes(id))?.id??null});}else if(item?.kind==='entity'||item?.kind==='parameter')onLink(item.kind,item.id,id);}}><span className="tree-drag-handle" title="Перетащить объект" draggable onDragStart={e=>startDrag(e,{kind:'shape',id})}>◈</span><button className={selection.kind==='shapes'&&selection.ids.includes(id)?'selected':''} onClick={e=>{e.preventDefault();select('shapes',id,e);}}><span className="shape-symbol"><Icon name={shape.kind==='value'?'counter':shape.kind}/></span><span>{shape.name}</span></button></summary>
   <div className="layer-children">{entities.map(entity=><button key={entity.id} className="tree-related-link" onClick={()=>navigate('entities',[entity.id])}>Связанная сущность: {entity.name} →</button>)}{references.map(r=><span className="binding-chip" key={r.id}><Icon name="link"/>{document.parameters.find(p=>p.id===r.parameterId)?.name??'Источник удалён'}<small>{geometryLabels[r.target.property??'radius']}</small></span>)}</div>
  </details>;
 }
 function groupRow(id:string,ancestors:string[]=[]):React.ReactNode {
  const group=document.sceneGroups.find(g=>g.id===id);if(!group||ancestors.includes(id))return null;
  return <details className="layer-branch" key={id} open><summary draggable onDragStart={e=>startDrag(e,{kind:'group',id})} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();const item=readDrag(e);if(item?.kind==='shape'||item?.kind==='group')onCommand({type:'scene.organize',shapeIds:item.kind==='shape'?(selection.kind==='shapes'&&selection.ids.includes(item.id)?selection.ids:[item.id]):[],groupIds:item.kind==='group'?[item.id]:[],parentId:id});}}><span className="tree-drag-handle" title="Перетащить группу" draggable onDragStart={e=>startDrag(e,{kind:'group',id})}><Icon name="folder"/></span><button className={selection.kind==='groups'&&selection.ids.includes(id)?'selected':''} onClick={e=>{e.preventDefault();select('groups',id,e);}}><span>{group.name}</span></button></summary><div className="layer-children">{renderLayers(id,[...ancestors,id])}</div></details>;
 }
 function renderLayers(parentId?:string,ancestors:string[]=[]):React.ReactNode {
  const entries=layerEntries(document,parentId),seen=new Set<string>();
  return entries.map(entry=>{
   if(entry.kind==='group')return groupRow(entry.id,ancestors);
   const entity=document.entities.find(e=>e.id===relatedEntityIds(document,entry.id)[0]);
   if(!entity)return shapeRow(entry.id);
   if(seen.has(entity.id))return null;seen.add(entity.id);
   const linked=entries.filter(e=>e.kind==='shape'&&relatedEntityIds(document,e.id)[0]===entity.id);
   return <details key={`entity-view:${entity.id}`} className="layer-branch entity-figure-folder" open><summary><Icon name="folder"/><span>{entity.name}</span></summary><div className="layer-children">{linked.map(e=>shapeRow(e.id))}</div></details>;
  });
 }
 const changes:string[]=[];
 if(debugValues){
  const format=(value:unknown):string=>value&&typeof value==='object'&&!Array.isArray(value)&&'kind' in value&&value.kind==='graph-reference'?('values' in value?Object.entries(value.values as Record<string,boolean>).map(([id,inside])=>`${document.shapes.find(s=>s.id===id)?.name??id}: ${inside?'Да':'Нет'}`).join(', '):'ids' in value?(value.ids as string[]).map(id=>document.shapes.find(s=>s.id===id)?.name??document.entities.find(e=>e.id===id)?.name??id).join(', '):''):Array.isArray(value)?`[${value.map(v=>typeof v==='number'?Number(v.toFixed(2)):String(v)).join(', ')}]`:typeof value==='number'?String(Number(value.toFixed(2))):String(value);
  for(const parameter of document.parameters){const before=readParameterValue(sourceDocument,parameter.id),after=readParameterValue(document,parameter.id);if(before.status==='ready'&&after.status==='ready'&&JSON.stringify(before.value)!==JSON.stringify(after.value))changes.push(`${parameter.name}: ${format(before.value)} → ${format(after.value)}`);}
  for(const node of document.logic.nodes.filter(n=>['calculate','variable','read','spatial','condition','repeat'].includes(n.data.role))){const before=sourceDocument.evaluations[`node:${node.id}`],after=document.evaluations[`node:${node.id}`];if(before?.status==='ready'&&after?.status==='ready'&&JSON.stringify(before.value)!==JSON.stringify(after.value))changes.push(`${node.data.label}: ${format(before.value)} → ${format(after.value)}`);}
  for(const shape of document.shapes.filter(s=>s.kind==='point')){const before=sourceDocument.shapes.find(s=>s.id===shape.id);if(before&&(before.x!==shape.x||before.y!==shape.y))changes.push(`${shape.name}: (${format(before.x)}, ${format(before.y)}) → (${format(shape.x)}, ${format(shape.y)})`);}
 }
 return <div className="content-tree" ref={treeRef}>{debugValues&&<section className="check-diff" aria-label="Изменения проверки"><strong>Изменения от исходной схемы</strong>{changes.length?<ul>{changes.slice(0,6).map((change,index)=><li key={`${index}-${change}`}>{change}</li>)}</ul>:<small>Пока нет изменений. Меняйте значения или положение в безопасной проверке.</small>}{changes.length>6&&<small>И ещё {changes.length-6}</small>}</section>}<div className="content-tabs" role="tablist" aria-label="Содержимое">{(['layers','entities','events'] as const).map(t=><button role="tab" key={t} aria-selected={tab===t} title={{layers:'Фигуры',entities:'Сущности',events:'События',paths:'Пути'}[t]} aria-label={{layers:'Фигуры',entities:'Сущности',events:'События',paths:'Пути'}[t]} onClick={()=>setTab(t)}><Icon name={({layers:'layers',entities:'person',events:'bolt',paths:'path'} as const)[t]}/></button>)}<span className="header-spacer"/>{tab!=='events'&&<IconButton icon="folder" label="Создать группу из выделения" onClick={()=>{if(tab==='entities')onCommand({type:'entity.group',id:crypto.randomUUID(),ids:selection.kind==='entities'?selection.ids:[],name:'Группа'});else onCommand({type:'scene.wrap',id:crypto.randomUUID(),shapeIds:selection.kind==='shapes'?selection.ids:[],groupIds:selection.kind==='groups'?selection.ids:[],name:'Группа'});}}/>}</div>
 <div className="tree-drop-root" role="tabpanel" aria-label={{layers:'Слои холста',entities:'Организация участников',events:'Контексты событий',paths:'Пути'}[tab]} onDragOver={e=>e.preventDefault()} onDrop={dropRoot}>
 {tab==='layers'&&<>{renderLayers()}</>}
 {tab==='entities'&&document.entities.filter(e=>!e.parentId).map(e=>entityRow(e.id))}
 {tab==='events'&&<>{document.logic.nodes.filter(n=>(n.data.role==='event'&&n.data.graph?.operation!=='trigger')||n.data.role==='context').map(n=><div className="event-context-row" key={n.id}><button className={`event-nav-row ${selection.kind==='logic'&&selection.ids.includes(n.id)?'selected':''}`} onClick={()=>{onSelect({kind:'logic',ids:[n.id]});if(n.data.role==='context')onHighlightContext(n.id);}}><Icon name={n.data.role==='event'?'bolt':'eventTag'}/><span>{n.data.label}</span></button></div>)}</>}

 {tab==='events'&&debugValues&&<details className="event-history" aria-label="Журнал событий"><summary>История · {document.behavior.events?.length??0}</summary>{[...(document.behavior.events??[])].reverse().map((entry,index)=><details key={index}><summary>{entry.tick} т · {entry.name}</summary>{entry.values.map(value=><div key={value.id}>{value.name}: {value.value}</div>)}</details>)}</details>}
 </div>{entityMenu&&<div className="entity-context-menu" role="menu" aria-label="Действия с сущностями" style={{left:entityMenu.x,top:entityMenu.y}}>
  <button role="menuitem" disabled={entityMenu.ids.length<2} onClick={()=>{onCommand({type:'entity.group',id:crypto.randomUUID(),ids:entityMenu.ids,name:'Группа'});setEntityMenu(null);}}>Группировать</button>
  <button role="menuitem" disabled={entityMenu.ids.length>1&&!commonParameterGroups(document,entityMenu.ids).length} onClick={()=>{if(entityMenu.ids.length>1)setEditingCommon(entityMenu.ids);else onSelect({kind:'entities',ids:entityMenu.ids});setEntityMenu(null);}}>Параметры</button>
  <button role="menuitem" onClick={()=>{onCommand({type:'selection.remove',shapeIds:[],entityIds:entityMenu.ids,nodeIds:[],groupIds:[]});onSelect({kind:'entities',ids:[]});setEntityMenu(null);}}>Удалить</button>
 </div>}{editingCommon&&<CommonParametersDialog document={document} ids={editingCommon} onCommand={onCommand} onClose={()=>setEditingCommon(null)}/>}</div>;
}
