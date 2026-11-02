import {advanceGraph,graphState} from './node-graph.ts';
import { checkEvents, executeEvent } from './behavior.ts';
import type { ExecutionClock } from './behavior.ts';
import { applyWorkspaceCommand } from '../workspace/document.ts';
import type { WorkspaceDocument } from '../workspace/document.ts';
import { evaluateWorkspace, readParameterValue } from './calculations.ts';
export type MarkerColor = 'green'|'red'|'blue'|'yellow';
export interface Marker { id:string; name:string; time:number; color:MarkerColor }
export interface Snapshot { id:string; name:string; time:number; values:{id:string;name:string;value:number}[]; positions:{id:string;name:string;x:number;y:number}[] }
export interface Motion { targetId:string; pathId:string; start:number }
export interface Rate { targetId:string; rate:number; start:number; duration:number }
export interface Playback { status:'idle'|'playing'|'paused'|'error'; debugging:boolean; looping:boolean; time:number; duration:number; tickSeconds:number; frame:WorkspaceDocument|null; debugBase:WorkspaceDocument|null; motions:Motion[]; rates:Rate[]; effects:Rate[]; markers:Marker[]; snapshots:Snapshot[]; error:string }
export type PlaybackCommand = {type:'playback.play'|'playback.pause'|'playback.restart'|'debug.start'|'debug.stop'}|{type:'debug.move';id:string;x:number;y:number}|{type:'debug.parameter';id:string;value:number}|{type:'debug.fire';nodeId:string}|{type:'playback.loop';enabled:boolean}|{type:'playback.advance';seconds:number}|{type:'playback.seek';time:number}|{type:'playback.duration';duration:number}|{type:'playback.tick-size';seconds:number}|{type:'snapshot.add';id:string;name:string}|{type:'snapshot.rename';id:string;name:string}|{type:'snapshot.time';id:string;time:number}|{type:'snapshot.value';id:string;parameterId:string;value:number}|{type:'snapshot.position';id:string;x:number;y:number;pointId:string}|{type:'snapshot.remove';id:string}|{type:'marker.add';id:string;name:string;time:number;color:MarkerColor}|{type:'marker.update';id:string;update:Partial<Omit<Marker,'id'>>}|{type:'marker.remove';id:string};
export const markerColors:Record<MarkerColor,string>={green:'#309653',red:'#d64848',blue:'#3478cf',yellow:'#e3b72f'};
export function nextSnapshotName(snapshots: readonly Pick<Snapshot, 'name'>[]): string {
 const names = new Set(snapshots.map(snapshot => snapshot.name));
 let index = 1;
 while (names.has(`P${index}`)) index++;
 return `P${index}`;
}
export function createPlayback():Playback { return {status:'idle',debugging:false,looping:false,time:0,duration:10,tickSeconds:1,frame:null,debugBase:null,motions:[],rates:[],effects:[],markers:[],snapshots:[],error:''}; }
export function resetPlayback(p:Playback):Playback { return {...p,status:'idle',debugging:false,time:0,frame:null,debugBase:null,motions:[],rates:[],effects:[],error:''}; }
function finite(value:number,min:number,max:number,label:string){if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${label}: от ${min} до ${max}.`);}
function name(value:string){if(!value.trim())throw new Error('Введите имя.');return value.trim();}
function clock(p:Playback):ExecutionClock {return {time:p.time,schedulePath(targetId,pathId){p.motions=p.motions.filter(m=>m.targetId!==targetId);p.motions.push({targetId,pathId,start:p.time});},scheduleRate(targetId,rate,duration){const effect={targetId,rate,duration,start:p.time};p.rates.push(effect);p.effects.push(effect);},checkpoint(){return {motions:[...p.motions],rates:[...p.rates],effects:[...p.effects]};},restore(state){p.motions=state.motions;p.rates=state.rates;p.effects=state.effects??p.effects;}};}
function start(doc:WorkspaceDocument,p:Playback,includeInside=true,includeManual=false):Playback {
 if(doc.recording)throw new Error('Завершите запись перед запуском.');
 p={...resetPlayback(p),status:'paused',frame:{...doc,behavior:{inside:{},results:{}}}};
 p.frame=applyKeys(p.frame!,p.snapshots,-1,0);
 if(includeManual)for(const node of doc.logic.nodes.filter(n=>n.data.role==='event'&&!doc.logic.nodes.some(source=>source.data.action?.operation==='emit'&&source.data.action.targetId===n.id)&&(!n.data.event||n.data.event.trigger==='manual'))){p.frame=executeEvent(p.frame!,node.id,clock(p));p=inspect(p);if(p.status==='error')return p;}
 p.frame=checkEvents(p.frame!,clock(p),includeInside);return inspect(p);
}
function applyKeys(frame:WorkspaceDocument,snapshots:Snapshot[],from:number,time:number):WorkspaceDocument {
 const keys=snapshots.slice().sort((a,b)=>a.time-b.time);
 for(const key of keys.filter(k=>k.time>from+1e-10&&k.time<=time+1e-10)) for(const item of key.values) {
  const parameter=frame.parameters.find(p=>p.id===item.id);
  if(parameter&&!parameter.sourceNodeId&&parameter.value!==item.value)frame=applyWorkspaceCommand(frame,{type:'parameter.update',id:item.id,update:{value:item.value}});
 }
 const pointIds=new Set(keys.flatMap(key=>key.positions.map(point=>point.id)));
 const positionsById=new Map<string,{x:number;y:number}>();
 for(const id of pointIds){
  const shape=frame.shapes.find(s=>s.id===id&&s.kind==='point');if(!shape)continue;
  const positions=keys.flatMap(key=>key.positions.filter(point=>point.id===id).map(point=>({time:key.time,...point})));
  const before=positions.filter(key=>key.time<=time+1e-10).at(-1);if(!before)continue;
  const after=positions.find(key=>key.time>time+1e-10);
  const fraction=after?(time-before.time)/(after.time-before.time):0;
  const x=after?before.x+(after.x-before.x)*fraction:before.x,y=after?before.y+(after.y-before.y)*fraction:before.y;
  if(shape.x!==x||shape.y!==y)positionsById.set(id,{x,y});
 }
 if(positionsById.size){frame={...frame,shapes:frame.shapes.map(shape=>positionsById.has(shape.id)?{...shape,...positionsById.get(shape.id)!}:shape)};frame={...frame,evaluations:evaluateWorkspace(frame)};}
 return frame;
}
function inspect(p:Playback):Playback {const error=Object.values(p.frame?.behavior.results??{}).find(r=>r.status==='error');return error?{...p,status:'error',error:error.message}:p;}
function pathPosition(points:{x:number;y:number}[],fraction:number){
 const lengths=points.slice(1).map((v,i)=>Math.hypot(v.x-points[i].x,v.y-points[i].y));let distance=lengths.reduce((a,b)=>a+b,0)*fraction;
 for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]&&lengths[i]>0){const t=distance/lengths[i];return {x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t};}distance-=lengths[i];}return points.at(-1)!;
}
function advance(p:Playback,target:number):Playback {
 p={...p,motions:[...p.motions],rates:[...p.rates]};
 while(p.time<target-1e-10 && p.status!=='error'){
  const upcoming=p.snapshots.filter(s=>s.time>p.time+1e-10).reduce((nearest,s)=>Math.min(nearest,s.time),Infinity);
  const next=Math.min(target,Math.floor(p.time+1e-7)+1,upcoming,...graphState(p.frame!).timers.filter(t=>t.end>p.time+1e-10).map(t=>t.end));let frame=p.frame!;
  for(const motion of p.motions){const path=frame.paths.find(v=>v.id===motion.pathId);if(!path)throw new Error('Путь исполнения удалён.');const pos=pathPosition(path.points,Math.min(1,(next-motion.start)/path.duration));frame=applyWorkspaceCommand(frame,{type:'shape.update',id:motion.targetId,update:pos});}
  for(const rate of p.rates){const elapsed=Math.max(0,Math.min(next,rate.start+rate.duration)-Math.max(p.time,rate.start));const parameter=frame.parameters.find(v=>v.id===rate.targetId);if(!parameter)throw new Error('Параметр эффекта удалён.');if(elapsed)frame=applyWorkspaceCommand(frame,{type:'parameter.update',id:parameter.id,update:{value:parameter.value+rate.rate*elapsed*p.tickSeconds}});}
  frame=advanceGraph(frame,p.time,next,p.tickSeconds);
  frame=applyKeys(frame,p.snapshots,p.time,next);
  p.time=next;p.frame=frame;p.motions=p.motions.filter(m=>next<m.start+frame.paths.find(v=>v.id===m.pathId)!.duration-1e-10);p.rates=p.rates.filter(r=>next<r.start+r.duration-1e-10);
  if(Math.abs(next-Math.round(next))<1e-7)p.frame=checkEvents(frame,clock(p));
  p=inspect(p);
 }
 return p.time>=p.duration-1e-9&&p.status!=='error'?{...p,time:p.duration,status:'paused'}:p;
}
export function playbackCommand(doc:WorkspaceDocument,current:Playback,command:PlaybackCommand):Playback {
 let p={...current};const findSnapshot=(id:string)=>{const s=p.snapshots.find(v=>v.id===id);if(!s)throw new Error('Снимок удалён.');return s;};
 switch(command.type){
 case 'playback.play': {
  if(p.frame&&p.status==='paused'&&p.time<p.duration)return {...p,status:'playing'};
  const debugging=p.debugging,base=debugging?(p.debugBase??doc):doc;
  p=start(base,p,!debugging,false);return p.status==='error'?p:{...p,status:'playing',debugging,debugBase:debugging?base:null};
 }
 case 'playback.pause':return {...p,status:p.status==='error'?'error':p.frame?'paused':'idle'};
 case 'playback.restart':{const base=p.debugging?(p.debugBase??doc):doc;return {...start(base,p,!p.debugging,false),debugging:p.debugging,debugBase:p.debugging?base:null};}
 case 'playback.loop':return {...p,looping:command.enabled};
 case 'playback.advance': {
  finite(command.seconds,0,1,'Шаг времени');if(p.status!=='playing')return p;
  let remaining=command.seconds;
  while(remaining>1e-10&&p.status==='playing'){
   const amount=Math.min(remaining,(p.duration-p.time)*p.tickSeconds);p=advance(p,p.time+amount/p.tickSeconds);remaining-=amount;
   if(p.status==='paused'&&p.looping){const debugging=p.debugging,base=debugging?(p.debugBase??doc):doc;p={...start(base,p,!debugging,false),debugging,debugBase:debugging?base:null};if(p.status!=='error')p.status='playing';}
  }
  return p;
 }
 case 'playback.seek':{finite(command.time,0,p.duration,'Тик');const debugging=p.debugging,base=debugging?(p.debugBase??doc):doc;return {...advance(start(base,p,!debugging,false),command.time),debugging,debugBase:debugging?base:null};}
 case 'debug.start':{if(doc.recording)throw new Error('Завершите запись перед проверкой.');const base=structuredClone({...doc,behavior:{inside:{},results:{}}});p={...p,status:'paused',debugging:true,time:0,frame:base,debugBase:base,motions:[],rates:[],effects:[],error:''};p.frame=checkEvents(p.frame!,clock(p),false,false);return inspect(p);}
 case 'debug.stop':return resetPlayback(p);
 case 'debug.move': {
  if(!p.debugging||!p.frame||!['paused','error'].includes(p.status))throw new Error('Поставьте проверку на паузу, чтобы менять положение.');
  const shape=p.frame.shapes.find(s=>s.id===command.id);if(shape&&shape.x===command.x&&shape.y===command.y)return p;
  p.frame=applyWorkspaceCommand(p.frame,{type:'shape.update',id:command.id,update:{x:command.x,y:command.y}});
  if(p.debugBase)p.debugBase=applyWorkspaceCommand(p.debugBase,{type:'shape.update',id:command.id,update:{x:command.x,y:command.y}});
  p.frame=checkEvents(p.frame,clock(p));return inspect(p);
 }
 case 'debug.parameter':{
  if(!p.debugging||!p.frame||!['paused','error'].includes(p.status))throw new Error('Поставьте проверку на паузу, чтобы менять параметры.');
  const parameter=p.frame.parameters.find(v=>v.id===command.id);if(!parameter||parameter.sourceNodeId)throw new Error('В проверке можно менять только параметр с ручным значением.');
  finite(command.value,-1e12,1e12,'Значение параметра');
  p.status='paused';p.error='';
  p.frame=applyWorkspaceCommand(p.frame,{type:'parameter.update',id:command.id,update:{value:command.value}});
  if(p.debugBase)p.debugBase=applyWorkspaceCommand(p.debugBase,{type:'parameter.update',id:command.id,update:{value:command.value}});
  p.frame=checkEvents(p.frame,clock(p));return inspect(p);
 }
 case 'debug.fire':{
  if(!p.debugging||!p.frame||!['paused','error'].includes(p.status))throw new Error('Поставьте проверку на паузу, чтобы вызвать событие.');
  p.status='paused';p.error='';p.frame=executeEvent(p.frame,command.nodeId,clock(p));return inspect(p);
 }
 case 'playback.duration':if(p.debugging)throw new Error('Задайте длительность в режиме редактирования.');finite(command.duration,1,10000,'Длительность в тиках');if(!Number.isInteger(command.duration))throw new Error('Длительность задаётся целым числом тиков.');if(p.markers.some(v=>v.time>command.duration)||p.snapshots.some(v=>v.time>command.duration))throw new Error('Сначала удалите отметки за новой границей.');return {...resetPlayback(p),duration:command.duration};
 case 'playback.tick-size':if(p.debugging)throw new Error('Задайте размер тика в режиме редактирования.');finite(command.seconds,0.001,300,'Время одного тика, с');return {...resetPlayback(p),tickSeconds:command.seconds};
 case 'marker.add':if(p.markers.some(v=>v.id===command.id))throw new Error('ID маркера уже существует.');finite(command.time,0,p.duration,'Время');if(!(command.color in markerColors))throw new Error('Выберите цвет маркера.');return {...p,markers:[...p.markers,{id:command.id,name:name(command.name),time:command.time,color:command.color}]};
 case 'marker.update':{const old=p.markers.find(v=>v.id===command.id);if(!old)throw new Error('Маркер удалён.');const marker={...old,...command.update};finite(marker.time,0,p.duration,'Время');marker.name=name(marker.name);if(!(marker.color in markerColors))throw new Error('Выберите цвет маркера.');return {...p,markers:p.markers.map(v=>v.id===marker.id?marker:v)};}
 case 'marker.remove':return {...p,markers:p.markers.filter(v=>v.id!==command.id)};
 case 'snapshot.add':{if(p.status==='playing'||p.status==='error'||doc.recording)throw new Error('Поставьте проигрывание на паузу для ключа.');if(p.snapshots.some(v=>v.id===command.id))throw new Error('ID ключа уже существует.');const frame=p.frame??doc;const values=frame.parameters.map(v=>{const r=readParameterValue(frame,v.id);if(r.status==='error'||typeof r.value!=='number')throw new Error(`Не вычислен параметр ${v.name}.`);return {id:v.id,name:v.name,value:r.value};});return {...p,snapshots:[...p.snapshots,{id:command.id,name:name(command.name),time:p.time,values,positions:frame.shapes.filter(s=>s.kind==='point').map(({id,name,x,y})=>({id,name,x,y}))}]};}
 case 'snapshot.rename':findSnapshot(command.id);return {...p,snapshots:p.snapshots.map(v=>v.id===command.id?{...v,name:name(command.name)}:v)};
 case 'snapshot.time':findSnapshot(command.id);finite(command.time,0,p.duration,'Время ключа');return {...p,snapshots:p.snapshots.map(v=>v.id===command.id?{...v,time:command.time}:v)};
 case 'snapshot.value':{const s=findSnapshot(command.id);if(!s.values.some(v=>v.id===command.parameterId)||!Number.isFinite(command.value))throw new Error('Выберите числовое значение ключа.');return {...p,snapshots:p.snapshots.map(v=>v.id===s.id?{...v,values:v.values.map(v=>v.id===command.parameterId?{...v,value:command.value}:v)}:v)};}
 case 'snapshot.position':{const s=findSnapshot(command.id);if(!s.positions.some(v=>v.id===command.pointId)||![command.x,command.y].every(Number.isFinite))throw new Error('Проверьте положение ключа.');return {...p,snapshots:p.snapshots.map(v=>v.id===s.id?{...v,positions:v.positions.map(v=>v.id===command.pointId?{...v,x:command.x,y:command.y}:v)}:v)};}
 case 'snapshot.remove':return {...p,snapshots:p.snapshots.filter(v=>v.id!==command.id)};
 }
}
