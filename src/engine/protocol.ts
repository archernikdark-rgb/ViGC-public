import { importLogicYaml } from '../workspace/yaml-transfer.ts';
import { validateBindings, localKey } from '../google/exchange.ts';
import type { CellBinding, LocalData } from '../google/exchange.ts';
import { bindingData } from '../google/sources.ts';
import { captureProject, restoreProject } from '../persistence/project.ts';
import type { SavedProject } from '../persistence/project.ts';
import { createPlayback, playbackCommand, resetPlayback } from './playback.ts';
import type { Playback, PlaybackCommand } from './playback.ts';
import { applyWorkspaceCommand, newDocument } from '../workspace/document.ts';
import type { WorkspaceCommand, WorkspaceDocument } from '../workspace/document.ts';

export type EngineCommand = {type:'logic.import-yaml';source:string;copyId:string;parentId?:string} | {type:'history.undo'|'history.redo'} | WorkspaceCommand | PlaybackCommand | {type:'project.restore';project:SavedProject} | {type:'project.saved';revision:number} | {type:'project.touch'} | {type:'training.start';project:SavedProject;modified:boolean} | {type:'training.end'} | {type:'sheets.bindings';bindings:CellBinding[]} | {type:'sheets.apply';bindingId:string;values:number[];expected:LocalData;binding:CellBinding;projectId:string};

export type EngineRequest =
  | { type: 'ping'; requestId: string }
  | { type: 'capture'; requestId: string }
  | { type: 'command'; requestId: string; command: EngineCommand; actionKey?: string };

export type EngineResponse =
  | { type: 'ready'; requestId: string; protocolVersion: 4; document: WorkspaceDocument; playback: Playback }
  | { type: 'captured';requestId:string;revision:number;project:SavedProject }
  | { type: 'updated'; requestId: string; document: WorkspaceDocument; playback: Playback; history?: {undo:boolean;redo:boolean} }
  | { type: 'rejected'; requestId: string; revision: number; message: string };

function createCoreSession(initialDocument = newDocument()) {
  let document = initialDocument;
  let playback=createPlayback();
  return (request: EngineRequest): EngineResponse => {
    if (request.type === 'ping') {
      return { type: 'ready', requestId: request.requestId, protocolVersion: 4, document, playback };
    }
    try {
      if(request.type==='capture')return {type:'captured',requestId:request.requestId,revision:document.revision,project:captureProject(document,playback)};
      if(request.command.type==='logic.import-yaml'){document=importLogicYaml(document,request.command.source,request.command.copyId,request.command.parentId);playback=resetPlayback(playback);}
      else if(request.command.type==='project.restore'){const restored=restoreProject(request.command.project);document={...restored.document,revision:document.revision+1};playback=restored.playback;}
      else if(request.command.type==='sheets.bindings'){
       validateBindings(request.command.bindings);
       for(const b of request.command.bindings)if(!document.sheets.some(old=>JSON.stringify(old)===JSON.stringify(b)))bindingData({...document,sheets:request.command.bindings},playback,b);
       document={...document,sheets:structuredClone(request.command.bindings),revision:document.revision+1,modified:true};
      }
      else if(request.command.type==='sheets.apply'){
       const c=request.command,b=document.sheets.find(b=>b.id===c.bindingId);if(!b||b.direction==='out'||c.projectId!==document.id||JSON.stringify(b)!==JSON.stringify(c.binding))throw Error('Проект или привязка изменились; повторите сверку.');
       const data=bindingData(document,playback,b);if(localKey(data)!==localKey(c.expected))throw Error('Локальное значение изменилось. Повторите сверку.');
       if(c.values.length!==data.values.length||c.values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Таблица должна содержать конечные числа нужного размера.');
       let next=document,nextPlayback=playback;const source=b.source;
       if(source.kind==='parameter')next=applyWorkspaceCommand(document,{type:'parameter.update',id:source.id,update:{value:c.values[0]}});
       else if(source.kind==='snapshot'){
        const s=playback.snapshots.find(v=>v.id===source.id)!;
        if(source.axis==='value')nextPlayback=playbackCommand(document,playback,{type:'snapshot.value',id:s.id,parameterId:source.entryId,value:c.values[0]});
        else {const pos=s.positions.find(v=>v.id===source.entryId)!;nextPlayback=playbackCommand(document,playback,{type:'snapshot.position',id:s.id,pointId:pos.id,x:source.axis==='x'?c.values[0]:pos.x,y:source.axis==='y'?c.values[0]:pos.y});}
       }else if(source.kind==='snapshot-all'){
        const s=playback.snapshots.find(v=>v.id===source.id)!;let i=0;
        nextPlayback={...playback,snapshots:playback.snapshots.map(v=>v.id===s.id?{...v,values:v.values.map(v=>({...v,value:c.values[i++]})),positions:v.positions.map(v=>({...v,x:c.values[i++],y:c.values[i++]}))}:v)};
       }else throw Error('Вычисляемое значение нельзя заменить импортом.');
       document={...next,revision:document.revision+1,modified:true};playback=source.kind==='parameter'?resetPlayback(nextPlayback):nextPlayback;
      }
      else if(request.command.type==='behavior.fire'){
       if(!playback.debugging)throw new Error('Вызов события доступен только в безопасном режиме «Проверка».');
       playback=playbackCommand(document,playback,{type:'debug.fire',nodeId:request.command.nodeId});
      }
      else if(request.command.type==='project.touch'){document={...document,revision:document.revision+1,modified:true};}
      else if(request.command.type==='project.saved'){if(document.revision===request.command.revision)document={...document,modified:false};}
      else if(request.command.type.startsWith('playback.')||request.command.type.startsWith('snapshot.')||request.command.type.startsWith('marker.')||request.command.type.startsWith('debug.')) {playback=playbackCommand(document,playback,request.command as PlaybackCommand);if(request.command.type.startsWith('snapshot.')||request.command.type.startsWith('marker.')||request.command.type==='playback.duration'||request.command.type==='playback.tick-size')document={...document,modified:true,revision:document.revision+1};}
      else {document = applyWorkspaceCommand(document, request.command as WorkspaceCommand);playback=request.command.type==='project.reset'?createPlayback():resetPlayback(playback);}
      return { type: 'updated', requestId: request.requestId, document, playback };
    } catch (error) {
      return {
        type: 'rejected',
        requestId: request.requestId,
        revision: document.revision,
        message: error instanceof Error ? error.message : 'Команда отклонена.',
      };
    }
  };
}


// History stores authored projects, never transient playback frames or external credentials.
export function createEngineSession(initialDocument = newDocument()) {
 const core=createCoreSession(initialDocument);
 const undo:{project:SavedProject;key?:string}[]=[],redo:SavedProject[]=[];
 let recordingStart:SavedProject|null=null;
 let trainingBackup:{project:SavedProject;modified:boolean;undo:{project:SavedProject;key?:string}[];redo:SavedProject[];recordingStart:SavedProject|null}|null=null;
 let capturedRevision=initialDocument.revision;
 const capture=()=>{const r=core({type:'capture',requestId:'history-capture'});if(r.type==='captured'||r.type==='rejected')capturedRevision=r.revision;return r.type==='captured'?r.project:null;};
 return (request:EngineRequest):EngineResponse=>{
  if(request.type!=='command')return core(request);
  const command=request.command;
  if(command.type==='training.start'){
   if(trainingBackup)return {type:'rejected',requestId:request.requestId,revision:capturedRevision,message:'Учебный режим уже запущен.'};
   const before=capture();if(!before)return {type:'rejected',requestId:request.requestId,revision:capturedRevision,message:'Завершите или отмените запись пути перед обучением.'};
   const response=core({type:'command',requestId:request.requestId,command:{type:'project.restore',project:command.project}});
   if(response.type==='updated')trainingBackup={project:before,modified:command.modified,undo:structuredClone(undo),redo:structuredClone(redo),recordingStart:structuredClone(recordingStart)};
   return response.type==='updated'?{...response,history:{undo:false,redo:false}}:response;
  }
  if(command.type==='training.end'){
   if(!trainingBackup)return {type:'rejected',requestId:request.requestId,revision:capturedRevision,message:'Учебный режим не запущен.'};
   const backup=trainingBackup;
   let response=core({type:'command',requestId:request.requestId,command:{type:'project.restore',project:backup.project}});
   if(response.type==='updated'&&backup.modified)response=core({type:'command',requestId:request.requestId,command:{type:'project.touch'}});
   undo.splice(0,undo.length,...backup.undo);redo.splice(0,redo.length,...backup.redo);recordingStart=backup.recordingStart;trainingBackup=null;
   return response.type==='updated'?{...response,history:{undo:undo.length>0,redo:redo.length>0}}:response;
  }
  if(command.type==='history.undo'||command.type==='history.redo') {
   const current=capture();
   if(!current)return {type:'rejected',requestId:request.requestId,revision:capturedRevision,message:'Завершите или отмените запись перед отменой действия.'};
   const next=command.type==='history.undo'?undo.pop()?.project:redo.pop();
   if(!next)return {type:'rejected',requestId:request.requestId,revision:capturedRevision,message:'В истории нет действия.'};
   const restored=core({type:'command',requestId:request.requestId,command:{type:'project.restore',project:next}});
   if(restored.type==='rejected'){if(command.type==='history.undo')undo.push({project:next});else redo.push(next);return restored;}
   if(command.type==='history.undo')redo.push(current);else undo.push({project:current});
   const response=core({type:'command',requestId:request.requestId,command:{type:'project.touch'}});
   return response.type==='updated'?{...response,history:{undo:undo.length>0,redo:redo.length>0}}:response;
  }
  const excluded=['project.reset','project.restore','project.saved','project.touch'].includes(command.type)||command.type.startsWith('sheets.')||command.type.startsWith('debug.')||command.type.startsWith('playback.')&&command.type!=='playback.duration'||command.type==='behavior.check'||command.type==='path.cancel';
  const before=excluded?null:capture();
  const beforeRevision=capturedRevision;
  const response=core(request);
  if(response.type!=='updated')return response;
  if(command.type==='project.reset'||command.type==='project.restore'||command.type.startsWith('sheets.')||command.type==='project.touch'){undo.length=0;redo.length=0;recordingStart=null;}
  else if(command.type==='path.begin')recordingStart=before;
  else if(command.type==='path.cancel')recordingStart=null;
  else {
   const previous=command.type==='path.finish'?recordingStart:before;
   if(previous&&!response.document.recording&&response.document.revision!==beforeRevision){
    const last=undo.at(-1);
    if(!request.actionKey||last?.key!==request.actionKey)undo.push({project:previous,key:request.actionKey});
    if(undo.length>100)undo.shift();redo.length=0;
   }
   if(command.type==='path.finish')recordingStart=null;
  }
  return {...response,history:{undo:undo.length>0,redo:redo.length>0}};
 };
}
