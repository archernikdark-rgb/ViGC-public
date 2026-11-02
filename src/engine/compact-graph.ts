import type {WorkspaceDocument,LogicEdge} from '../workspace/document.ts';
import type {SourceField,ChangeRow} from './node-graph.ts';

// Explicit authoring transformations: the resulting document contains real rows and wires,
// not collapsed screenshots or opaque scenario macros.
export function compactGraph(document:WorkspaceDocument):WorkspaceDocument['logic']{
 let nodes=structuredClone(document.logic.nodes),edges=structuredClone(document.logic.edges);
 const remove=(id:string)=>{nodes=nodes.filter(n=>n.id!==id);edges=edges.filter(e=>e.source!==id&&e.target!==id);};
 const sourceFields:SourceField[]=[];
 const fieldFor=new Map<string,string>();
 function source(referenceId:string,type:SourceField['type'],label:string){const key=type+':'+referenceId;let id=fieldFor.get(key);if(!id){id='source-'+sourceFields.length;sourceFields.push({id,label,type,referenceId});fieldFor.set(key,id);}return id;}
 for(const n of [...nodes]){const g=n.data.graph;if(!g)continue;
  if(['point','area','entity','parameter','set'].includes(g.operation)&&!edges.some(e=>e.target===n.id)){
   if(g.operation==='set'){
    const outgoing=edges.filter(e=>e.source===n.id);for(const id of g.ids??[]){const shape=document.shapes.find(s=>s.id===id);if(!shape)continue;const handle=source(id,shape.kind==='point'?'point':'area',shape.name);for(const e of outgoing)edges.push({...e,id:e.id+':'+id,source:'sources',sourceHandle:handle});}
   }else{const handle=source(g.referenceId??'',g.operation==='parameter'?'number':g.operation as SourceField['type'],n.data.label);for(const e of edges)if(e.source===n.id){e.source='sources';e.sourceHandle=handle;}}
   remove(n.id);
  }
 }
 if(sourceFields.length)nodes.unshift({id:'sources',type:'draft',position:{x:30,y:40},data:{role:'calculate',label:'Источники',graph:{operation:'sources',fields:sourceFields}}});
 // One spatial query returns named area results directly; no set/split wrappers.
 const inside=nodes.filter(n=>n.data.graph?.operation==='inside');
 if(inside.length){const common=inside[0],keys:string[]=[];for(const n of inside.filter(n=>{const a=edges.find(e=>e.target===common.id&&e.targetHandle==='point'),b=edges.find(e=>e.target===n.id&&e.targetHandle==='point');return a?.source===b?.source&&a?.sourceHandle===b?.sourceHandle;})){
   for(const split of nodes.filter(s=>s.data.graph?.operation==='split'&&edges.some(e=>e.source===n.id&&e.target===s.id))){const key=split.data.graph!.key!;keys.push(key);for(const e of edges)if(e.source===split.id){e.source=common.id;e.sourceHandle='area:'+key;}remove(split.id);}
   if(n!==common){for(const e of [...edges.filter(e=>e.target===n.id&&e.targetHandle==='areas')])if(!edges.some(x=>x.target===common.id&&x.targetHandle==='areas'&&x.source===e.source&&x.sourceHandle===e.sourceHandle))edges.push({...e,id:e.id+':shared',target:common.id});remove(n.id);}
  }common.data.label='Игрок в зонах?';common.data.graph!.keys=[...new Set(keys)];}
 // Full trace uses the existing ordered intersection engine; its target participates in first hit.
 for(const n of nodes.filter(n=>n.data.graph?.operation==='blocked')){n.data.graph={operation:'trace',defaults:{range:1000}};n.data.label='Первое попадание';for(const e of edges)if(e.target===n.id&&e.targetHandle==='areas')e.targetHandle='objects';for(const inv of [...nodes.filter(x=>x.data.graph?.operation==='not'&&edges.some(e=>e.source===n.id&&e.target===x.id))]){for(const e of edges)if(e.source===inv.id){e.source=n.id;e.sourceHandle='reached';}remove(inv.id);}}
 // A condition's execution output invokes the event. A duplicate branch is unnecessary.
 for(const branch of [...nodes.filter(n=>n.data.graph?.operation==='branch')]){const input=edges.find(e=>e.target===branch.id&&e.targetHandle==='condition'),pred=nodes.find(n=>n.id===input?.source);if(!pred||!['compare','and','or','not'].includes(pred.data.graph?.operation??''))continue;if(edges.some(e=>e.source===pred.id&&e.target!==branch.id))continue;for(const e of edges){if(e.source===branch.id)e.source=pred.id;if(e.target===branch.id&&e.targetHandle==='exec')e.target=pred.id;}pred.position=branch.position;remove(branch.id);}
 for(const ev of nodes.filter(n=>n.data.graph?.operation==='event')){const edge=edges.find(e=>e.target===ev.id&&e.targetHandle==='condition'),source=nodes.find(n=>n.id===edge?.source);if(edge&&source&&['compare','and','or','not'].includes(source.data.graph?.operation??'')){edge.sourceHandle='true';edge.targetHandle='exec';}}
 // A manual event can be gated by the shared condition without a duplicate branch.
 for(const branch of [...nodes.filter(n=>n.data.graph?.operation==='branch')]){const condition=edges.find(e=>e.target===branch.id&&e.targetHandle==='condition'),yes=edges.filter(e=>e.source===branch.id),incoming=edges.filter(e=>e.target===branch.id&&e.targetHandle==='exec'),event=nodes.find(n=>n.id===yes[0]?.target);if(condition&&incoming.length&&yes.length===1&&yes[0].sourceHandle==='true'&&event?.data.graph?.operation==='event'){edges.push({...condition,id:condition.id+':gate',target:event.id});for(const e of incoming)e.target=event.id;remove(branch.id);}}
 // The false side of the same visibility check stops growth; no inverted duplicate check.
 for(const inv of [...nodes.filter(n=>n.data.graph?.operation==='not')]){const input=edges.find(e=>e.target===inv.id&&e.targetHandle==='x'),src=nodes.find(n=>n.id===input?.source);if(src?.data.graph?.operation==='and'&&edges.filter(e=>e.source===inv.id).every(e=>e.sourceHandle==='true')){for(const e of edges)if(e.source===inv.id){e.source=src.id;e.sourceHandle='false';}remove(inv.id);}}
 const territoryEvent=nodes.find(n=>n.id==='territory-event');if(territoryEvent){const condition=edges.find(e=>e.target===territoryEvent.id&&e.targetHandle==='condition');if(condition){const id='territory-condition';nodes.push({id,type:'draft',position:{x:0,y:0},data:{role:'condition',label:'На территории?',graph:{operation:'branch'}}});condition.target=id;edges.push({id:'territory-exec',source:id,sourceHandle:'true',target:territoryEvent.id,targetHandle:'exec'});}}
 const writes=new Set(['set-value','add','rate','multiply']);
 // Combine a contiguous write chain only when its internal execution link has no other callers.
 for(const first of [...nodes]){if(!nodes.includes(first)||!writes.has(first.data.graph?.operation??''))continue;const chain=[first];let tail=first;
  while(true){const nextEdge=edges.filter(e=>e.source===tail.id&&e.sourceHandle==='then'&&e.targetHandle==='exec');if(nextEdge.length!==1)break;const next=nodes.find(n=>n.id===nextEdge[0].target);if(!next||!writes.has(next.data.graph?.operation??'')||chain.includes(next)||edges.filter(e=>e.target===next.id&&e.targetHandle==='exec').length!==1)break;chain.push(next);tail=next;}
  const changes:ChangeRow[]=chain.map((n,i)=>({id:'change-'+i,label:n.data.label,operation:n.data.graph!.operation as ChangeRow['operation'],...(n.data.graph!.defaults?.amount!==undefined?{amount:Number(n.data.graph!.defaults.amount)}:{})}));
  const oldIds=new Set(chain.map(n=>n.id));const rewritten:LogicEdge[]=[];
  for(const edge of edges){if(oldIds.has(edge.source)&&oldIds.has(edge.target)&&edge.targetHandle==='exec')continue;const e={...edge};const si=chain.findIndex(n=>n.id===e.source),ti=chain.findIndex(n=>n.id===e.target);if(si>=0){e.source=first.id;if(e.sourceHandle==='value')e.sourceHandle=changes[si].id+':effect';}if(ti>=0){e.target=first.id;if(e.targetHandle==='parameter'||e.targetHandle==='amount')e.targetHandle=changes[ti].id+':'+e.targetHandle;}rewritten.push(e);}
  edges=rewritten;first.data.graph={operation:'changes',changes};first.data.label=changes.length>1?'Изменить параметры':first.data.label;nodes=nodes.filter(n=>n===first||!oldIds.has(n.id));
 }
 // Remove disconnected diagnostic reads; they must not inflate the authored mechanic.
 for(const n of [...nodes])if(['compare','math','not','and','or'].includes(n.data.graph?.operation??'')&&!edges.some(e=>e.source===n.id))remove(n.id);
 return {nodes,edges};
}
