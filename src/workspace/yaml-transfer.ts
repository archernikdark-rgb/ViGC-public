import {multipleGraphInput} from '../engine/node-graph.ts';
import { parseDocument, stringify } from 'yaml';
import { descendants, duplicateNodes, validateHierarchy } from './composition.ts';
import { logicConnectionKind, newDocument, applyWorkspaceCommand } from './document.ts';
import { restoreProject } from '../persistence/project.ts';
import type { LogicNode, WorkspaceDocument } from './document.ts';

const format = 'vigc-logic';
const fail = () => { throw new Error('Файл YAML повреждён или имеет неподдерживаемый формат. Схема не изменена.'); };

// Only block-owned settings are portable. IDs of entities, shapes and paths are deliberately discarded.
function portableNode(node: LogicNode, included: Set<string>): LogicNode {
 const { graph, event, action, spatial, label, role, exposedPorts, calculation, variableValue, note, noteCollapsed } = structuredClone(node.data);
 return { id: node.id, type: 'draft', ...(node.parentId && included.has(node.parentId) ? {parentId:node.parentId}:{}), position: {...node.position}, data: {
  label, role, ...(graph?{graph:{...graph,fields:graph.fields?.map(f=>({...f,...(f.type!=='number'?{key:f.key??f.referenceId}:{}),referenceId:''})),changes:graph.changes?.map(r=>({...r,parameterId:undefined})),keys:graph.keys,referenceId:graph.referenceId&&included.has(graph.referenceId)?graph.referenceId:'',ids:[],key:''}}:{}), ...(note===undefined?{}:{note}), ...(noteCollapsed===undefined?{}:{noteCollapsed}), ...(exposedPorts ? {exposedPorts:exposedPorts.filter(port=>!port.includes(':parameter:')&&!port.includes(':shape:'))} : {}), ...(calculation ? {calculation} : {}), ...(variableValue === undefined ? {} : {variableValue}),
  ...(event ? {event:{trigger:event.trigger,...(event.threshold===undefined?{}:{threshold:event.threshold}),...(event.comparison?{comparison:event.comparison}:{})}} : {}),
  ...(action ? {action:{operation:action.operation,targetId:action.operation==='emit'&&included.has(action.targetId)?action.targetId:'',...(action.duration === undefined ? {} : {duration:action.duration})}} : {}),
  ...(spatial ? {spatial:{...spatial,originId:'',targetId:undefined,groupId:undefined,originAnchor:undefined,targetAnchor:undefined,stopId:undefined,stopGroupId:undefined}} : {}),
 }};
}
export function exportLogicYaml(document: WorkspaceDocument, nodeIds: string[]): string {
 if (!nodeIds.length || nodeIds.some(id=>!document.logic.nodes.some(n=>n.id===id))) throw new Error('Выберите блоки для экспорта.');
 const ids=descendants(document.logic,nodeIds);
 const nodes=document.logic.nodes.filter(n=>ids.has(n.id)).map(n=>portableNode(n,ids));
 const edges=document.logic.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)&&!(['context','event'].includes(document.logic.nodes.find(n=>n.id===e.source)?.data.role??'')&&(e.sourceHandle?.startsWith('parameter:')||e.sourceHandle?.startsWith('shape:')))).map(e=>({...e}));
 return stringify({format,version:1,logic:{nodes,edges}});
}
export function importLogicYaml(document: WorkspaceDocument, source: string, copyId: string, parentId?: string): WorkspaceDocument {
 if (source.length > 1_000_000) throw new Error('Файл YAML слишком большой. Схема не изменена.');
 try {
  const parsed=parseDocument(source,{uniqueKeys:true});
  if(parsed.errors.length) return fail();
  const value=parsed.toJS({maxAliasCount:0}) as {format?:unknown;version?:unknown;logic?:WorkspaceDocument['logic']};
  if(!value || value.format!==format || value.version!==1 || !value.logic || !Array.isArray(value.logic.nodes) || !Array.isArray(value.logic.edges) || !value.logic.nodes.length || value.logic.nodes.length>1000 || value.logic.edges.length>5000 || !copyId) return fail();
  const raw=value.logic;
  if(raw.nodes.some(n=>n?.data?.role==='context' && n.data.contextEntityIds?.length)) return fail();
  if(raw.edges.some(e=>e.sourceHandle?.startsWith('parameter:')||e.sourceHandle?.startsWith('shape:'))) return fail();
  // Reuse the project boundary's type/shape validation before considering IDs or links.
  const empty=newDocument('yaml-validation');
  const checked=restoreProject({version:3,document:{...empty,logic:raw},playback:{duration:10,tickSeconds:1,snapshots:[],markers:[]},google:null}).document;
  validateHierarchy(checked.logic);
  const ids=new Set(checked.logic.nodes.map(n=>n.id));
  for (const node of checked.logic.nodes) {
   const {role,event,action,spatial}=node.data;
   if(event && (role!=='event' || !['manual','enter','inside','leave','condition','visibility'].includes(event.trigger))) return fail();
   if(action && (role!=='action' || !['set','add','move','translate','path','rate','emit'].includes(action.operation))) return fail();
   if(spatial && (role!=='spatial' || !['position','distance','direction','inside','nearest','raycast','trace'].includes(spatial.operation))) return fail();
  }
  const edgeTargets=new Set<string>(), edgeOutputs=new Set<string>();
  for(const edge of checked.logic.edges) {
   if(!ids.has(edge.source)||!ids.has(edge.target)) return fail();
   const kind=logicConnectionKind(checked.logic,edge);
   const multiple=kind==='exec'||multipleGraphInput(checked.logic,edge.target,edge.targetHandle);
   const key=multiple?JSON.stringify([edge.source,edge.sourceHandle,edge.target,edge.targetHandle]):JSON.stringify([edge.target,edge.targetHandle]);
   const seen=multiple?edgeOutputs:edgeTargets;
   if(seen.has(key)) return fail();
   seen.add(key);
  }
  const roots=checked.logic.nodes.filter(n=>!n.parentId).map(n=>n.id);
  if(!roots.length) return fail();
  const cleaned={...checked,logic:{nodes:checked.logic.nodes.map(n=>portableNode(n,ids)),edges:checked.logic.edges}};
  const copied=duplicateNodes(cleaned,roots,copyId).logic;
  const added=copied.nodes.filter(n=>!ids.has(n.id));
  const addedEdges=copied.edges.filter(e=>!checked.logic.edges.some(old=>old.id===e.id));
  if(parentId && !document.logic.nodes.some(n=>n.id===parentId&&n.data.role==='group')) return fail();
  const mapped=added.map(n=>!n.parentId && parentId?{...n,parentId}:n);
  const nodeIds=new Set(document.logic.nodes.map(n=>n.id)),edgeIds=new Set(document.logic.edges.map(e=>e.id));
  if(mapped.some(n=>nodeIds.has(n.id))||addedEdges.some(e=>edgeIds.has(e.id))) throw new Error('ID импортируемой копии уже занят. Повторите импорт.');
  return applyWorkspaceCommand(document,{type:'logic.replace',logic:{nodes:[...document.logic.nodes,...mapped],edges:[...document.logic.edges,...addedEdges]}});
 } catch(error) {
  if(error instanceof Error && error.message.startsWith('ID импортируемой')) throw error;
  return fail();
 }
}
