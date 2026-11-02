import {validateGraph} from '../engine/node-graph.ts';
import type {GraphDefinition} from '../engine/node-graph.ts';
import { validateGeometry } from '../workspace/geometry.ts';
import type { SceneShape } from '../workspace/document.ts';
import { validateBindings } from '../google/exchange.ts';
import type { WorkspaceDocument } from '../workspace/document.ts';
import { evaluateWorkspace } from '../engine/calculations.ts';
import { createPlayback } from '../engine/playback.ts';
import type { Playback } from '../engine/playback.ts';
import { validateHierarchy } from '../workspace/composition.ts';

export interface GoogleSelection { id: string; name: string }
export interface SavedProject {
 version: 1 | 2 | 3;
 document: Omit<WorkspaceDocument,'revision'|'modified'|'recording'|'behavior'|'evaluations'>;
 playback: Pick<Playback,'duration'|'snapshots'|'markers'> & {tickSeconds?:number};
 google: GoogleSelection|null;
}
export function captureProject(document:WorkspaceDocument,playback:Playback,google:GoogleSelection|null=null):SavedProject {
 if(document.recording)throw new Error('Завершите или отмените запись пути перед сохранением.');
 const {revision,modified,recording,behavior,evaluations,...authoring}=document;
 return structuredClone({version:3 as const,document:authoring,playback:{duration:playback.duration,tickSeconds:playback.tickSeconds,snapshots:playback.snapshots,markers:playback.markers},google});
}
function fail():never {throw new Error('Сохранение повреждено или имеет неподдерживаемый формат. Текущий проект не изменён.');}
function object(v:unknown):Record<string,unknown> {if(!v||typeof v!=='object'||Array.isArray(v))fail();return v as Record<string,unknown>;}
function text(v:unknown){if(typeof v!=='string')fail();}
function number(v:unknown){if(typeof v!=='number'||!Number.isFinite(v))fail();}
function list(v:unknown,check:(r:Record<string,unknown>)=>void,unique=true){if(!Array.isArray(v))fail();const ids=new Set();for(const item of v){const r=object(item);if(unique){text(r.id);if(!r.id||ids.has(r.id))fail();ids.add(r.id);}check(r);}}
function optional(r:Record<string,unknown>,key:string,check:(v:unknown)=>void){if(r[key]!==undefined)check(r[key]);}
function fields(r:Record<string,unknown>,strings:string[],numbers:string[]=[]){strings.forEach(k=>text(r[k]));numbers.forEach(k=>number(r[k]));}
function point(v:unknown){const r=object(v);fields(r,[],['x','y']);}
function strings(v:unknown){if(!Array.isArray(v)||v.some(s=>typeof s!=='string'))fail();}
export function restoreProject(value:unknown):{document:WorkspaceDocument;playback:Playback;google:GoogleSelection|null} {
 const envelope=object(value);if(envelope.version!==1&&envelope.version!==2&&envelope.version!==3)fail();const legacy=envelope.version!==3,d=object(envelope.document),p=object(envelope.playback);
 fields(d,['id','name']);if(!d.id)fail();
 list(d.entities,r=>{fields(r,['name']);optional(r,'parentId',text);for(const k of ['labelVisible','folder'])optional(r,k,v=>{if(typeof v!=='boolean')fail();});});
 list(d.parameters,r=>{fields(r,['name','ownerId'],['value']);optional(r,'sourceNodeId',text);optional(r,'controls',v=>{const c=object(v);for(const k of ['min','max','step'])optional(c,k,number);if(c.step!==undefined&&(c.step as number)<=0)fail();if(c.min!==undefined&&c.max!==undefined&&(c.min as number)>(c.max as number))fail();});});
 list(d.shapes,r=>{fields(r,['name','color'],['x','y','radius','transparency']);if(!['point','circle','arrow','text','rectangle','polygon','chart','comment','value'].includes(String(r.kind)))fail();optional(r,'entityId',text);optional(r,'centerPointId',text);optional(r,'displayParameterId',text);for(const k of ['width','height','sides','innerRadius','fillPercent','rotation'])optional(r,k,number);validateGeometry(r as unknown as SceneShape);});
 list(d.references,r=>{fields(r,['parameterId']);const t=object(r.target);fields(t,['id']);if(!['shape','logic-node'].includes(String(t.kind)))fail();optional(t,'property',v=>{if(!['radius','width','height','sides','innerRadius','fillPercent','rotation','transparency'].includes(String(v)))fail();});});
 const logic=object(d.logic);
 list(logic.nodes,r=>{if(r.type!=='draft')fail();point(r.position);optional(r,'parentId',text);const data=object(r.data);fields(data,['label']);if(!['note','event','context','read','calculate','variable','group','condition','action','spatial','repeat'].includes(String(data.role)))fail();optional(data,'note',text);optional(data,'noteCollapsed',v=>{if(typeof v!=='boolean')fail();});optional(data,'contextEntityIds',strings);optional(data,'contextParameterOrder',strings);optional(data,'variableValue',number);optional(data,'exposedPorts',strings);
  optional(data,'graph',v=>validateGraph(v as GraphDefinition));
  optional(data,'calculation',v=>{const c=object(v);fields(c,['expression']);list(c.inputs,input=>fields(input,['alias']));});
  for(const key of ['event','action','spatial'])optional(data,key,v=>{const config=object(v);for(const [k,item]of Object.entries(config)){if(['duration','angle','range','threshold'].includes(k))number(item);else text(item);}});
  if(!legacy&&data.role==='action'&&data.action){const action=object(data.action);if(action.operation==='rate'&&(typeof action.duration!=='number'||!Number.isInteger(action.duration)||action.duration<1||action.duration>10000))fail();}
 });
 list(logic.edges,r=>{fields(r,['source','target']);for(const k of ['sourceHandle','targetHandle'])if(r[k]!=null)text(r[k]);});
 list(d.sceneGroups,r=>{fields(r,['name']);strings(r.shapeIds);optional(r,'parentId',text);});
 list(d.paths,r=>{fields(r,['name','pointId'],['duration']);if((r.duration as number)<=0||(!legacy&&!Number.isInteger(r.duration)))fail();list(r.points,point,false);if(!(r.points as unknown[]).length)fail();});
 number(p.duration);if(legacy?((p.duration as number)<1/30||(p.duration as number)>300):((p.duration as number)<1||(p.duration as number)>10000||!Number.isInteger(p.duration)))fail();
 if(!legacy){number(p.tickSeconds);if((p.tickSeconds as number)<0.001||(p.tickSeconds as number)>300)fail();}
 list(p.snapshots,r=>{fields(r,['name'],['time']);if((r.time as number)<0||(r.time as number)>(p.duration as number))fail();list(r.values,v=>fields(v,['name'],['value']));list(r.positions,v=>fields(v,['name'],['x','y']));});
 list(p.markers,r=>{fields(r,['name'],['time']);if((r.time as number)<0||(r.time as number)>(p.duration as number)||!['green','red','blue','yellow'].includes(String(r.color)))fail();});
 if(envelope.google!==null){const g=object(envelope.google);fields(g,['id','name']);if(!/^[\w-]+$/.test(g.id as string))fail();}
 validateBindings(d.sheets??[]);
 const saved=structuredClone(value) as SavedProject;
 if(legacy){
  // Old projects measured timeline and behavior durations in seconds. Preserve
  // their 30 Hz event resolution by expressing those seconds as 1/30 s ticks.
  const scale=30,toTicks=(seconds:number)=>Math.round(seconds*scale);
  saved.version=3;saved.playback.tickSeconds=1/scale;saved.playback.duration=Math.max(1,toTicks(saved.playback.duration));
  for(const item of saved.playback.snapshots)item.time=toTicks(item.time);
  for(const item of saved.playback.markers)item.time=toTicks(item.time);
  for(const path of saved.document.paths)path.duration=Math.max(1,toTicks(path.duration));
  for(const node of saved.document.logic.nodes){const action=node.data.action;if(action?.operation==='rate'&&typeof action.duration==='number')action.duration=Math.max(1,toTicks(action.duration));}
 }
 // Replace the old generated a1/a2 aliases in existing projects. Edges use
 // stable input IDs, so this only updates formula tokens and their UI labels.
 for(const node of saved.document.logic.nodes){const calculation=node.data.calculation;if(!calculation)continue;for(const input of calculation.inputs){const match=input.alias.match(/^a(\d+)$/);if(!match)continue;const alias=`input_${match[1]}`;calculation.expression=calculation.expression.replace(new RegExp(`\\b${input.alias}\\b`,'g'),alias);input.alias=alias;}}
 const source=saved.document;
 const document:WorkspaceDocument={id:source.id,name:source.name,entities:source.entities,parameters:source.parameters,shapes:source.shapes,logic:source.logic,paths:source.paths,references:source.references,sheets:source.sheets??[],sceneGroups:source.sceneGroups,revision:0,modified:false,recording:null,behavior:{inside:{},results:{}},evaluations:{}};
 for(const records of [document.entities,document.sceneGroups])for(const record of records){const seen=new Set<string>([record.id]);let parent=record.parentId;while(parent){if(seen.has(parent))fail();seen.add(parent);const owner=records.find(r=>r.id===parent);if(!owner)fail();parent=owner.parentId;}}
 validateHierarchy(document.logic);document.evaluations=evaluateWorkspace(document);
 return {document,playback:{...createPlayback(),duration:saved.playback.duration,tickSeconds:saved.playback.tickSeconds??1,snapshots:saved.playback.snapshots,markers:saved.playback.markers},google:saved.google};
}
