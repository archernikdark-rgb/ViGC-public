import { useEffect, useRef, useState } from 'react';
import { SavePolicy } from './policy.ts';
import { loadProject, recentProjects, saveProject } from './store.ts';
import type { GoogleSelection, SavedProject } from './project.ts';
import { projectCopyForImport } from './importProject.ts';
import type { EngineCommand, EngineResponse } from '../engine/protocol.ts';
import type { WorkspaceDocument } from '../workspace/document.ts';
type SwitchDecision='save'|'discard'|'cancel';
type Recent=Awaited<ReturnType<typeof recentProjects>>;
export function useProjectFiles(options:{document:WorkspaceDocument;request:(command:EngineCommand|'capture')=>Promise<EngineResponse>;google:GoogleSelection|null;onGoogleRestore:(selection:GoogleSelection|null)=>void;notice:(message:string)=>void;confirmSwitch:()=>Promise<SwitchDecision>;beforeSave:()=>Promise<boolean>}) {
 const [recent,setRecent]=useState<Recent>([]),[busy,setBusy]=useState(false),[savedId,setSavedId]=useState<string|null>(null),[lastSaved,setLastSaved]=useState<number|null>(null);
 const policy=useRef(new SavePolicy()),saving=useRef(false),switching=useRef(false),training=useRef(false),latest=useRef(options),retryAfter=useRef(0),storedVersion=useRef<number|null>(null),gesture=useRef<string|null>(null),pointer=useRef(false),focused=useRef(false);
 latest.current=options;
 const refresh=()=>recentProjects().then(setRecent).catch(()=>options.notice('Не удалось прочитать недавние проекты. Проверьте доступ браузера к хранилищу.'));
 useEffect(()=>{void refresh();
  const focusin=(event:FocusEvent)=>{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement){focused.current=true;gesture.current=crypto.randomUUID();}};
  const focusout=()=>{focused.current=false;gesture.current=null;};
  const down=()=>{pointer.current=true;if(!focused.current)gesture.current=crypto.randomUUID();};
  const up=()=>{pointer.current=false;if(!focused.current)gesture.current=null;};
  window.addEventListener('focusin',focusin);window.addEventListener('focusout',focusout);window.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
  return ()=>{window.removeEventListener('focusin',focusin);window.removeEventListener('focusout',focusout);window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
 },[]);
 function actionKey(){return gesture.current??crypto.randomUUID();}
 function setTraining(active:boolean){training.current=active;}
 function changed(command:EngineCommand,key:string,recording:boolean){
  if(training.current)return;
  if(command.type.startsWith('debug.')||command.type==='playback.loop')return;
  if(['project.saved','project.restore','project.reset','playback.play','playback.pause','playback.restart','playback.advance','playback.seek','behavior.check','path.begin','path.cancel'].includes(command.type))return;
  if(recording&&command.type==='shape.update')return;
  policy.current.changed(key,Date.now());
 }
 async function save(_automatic=false):Promise<boolean>{
  if(saving.current||training.current)return false;saving.current=true;setBusy(true);
  let written=false;
  try{
   if(!_automatic&&!await latest.current.beforeSave())return false;
   const response=await latest.current.request('capture');if(response.type!=='captured')throw Error('Ядро не подтвердило данные сохранения.');
   const ticket=policy.current.ticket();
   const record=await saveProject({...response.project,google:latest.current.google},storedVersion.current);
   written=true;storedVersion.current=record.updated;policy.current.saved(ticket,Date.now());setSavedId(record.id);setLastSaved(record.updated);await refresh();
   await latest.current.request({type:'project.saved',revision:response.revision});
   retryAfter.current=0;return true;
  }catch(error){retryAfter.current=Date.now()+30000;latest.current.notice(`${written?'Данные записаны в браузер, но ядро не подтвердило сохранение.':'Не удалось сохранить проект.'} ${error instanceof Error?error.message:'Проверьте доступ к хранилищу.'}`);return false;}
  finally{saving.current=false;setBusy(false);}
 }
 useEffect(()=>{const timer=window.setInterval(()=>{if(!training.current&&Date.now()>=retryAfter.current&&!saving.current&&!switching.current&&!pointer.current&&!focused.current&&!latest.current.document.recording&&policy.current.due(Date.now()))void save(true);},1000);return ()=>clearInterval(timer);},[]);
 async function allowSwitch(){
  if(!latest.current.document.modified)return true;
  const decision=await latest.current.confirmSwitch();
  return decision==='save'?save():decision==='discard';
 }
 async function open(id:string){
  if(training.current||saving.current||switching.current)return;switching.current=true;setBusy(true);
  try{if(!await allowSwitch())return;const record=await loadProject(id),project=record.project;const response=await latest.current.request({type:'project.restore',project});if(response.type!=='updated')throw Error('Ядро не открыло проект.');policy.current=new SavePolicy();policy.current.saved(0,Date.now());storedVersion.current=record.updated;setSavedId(id);setLastSaved(record.updated);latest.current.onGoogleRestore(project.google);latest.current.notice('');}
  catch(error){latest.current.notice(error instanceof Error?error.message:'Не удалось открыть проект. Текущая работа сохранена в памяти.');}
  finally{switching.current=false;setBusy(false);}
 }
 async function create():Promise<boolean>{
  if(training.current||saving.current||switching.current)return false;switching.current=true;setBusy(true);
  try{if(!await allowSwitch())return false;const response=await latest.current.request({type:'project.reset',id:crypto.randomUUID()});if(response.type!=='updated')throw Error('Ядро не создало новый проект.');policy.current=new SavePolicy();storedVersion.current=null;setSavedId(null);setLastSaved(null);latest.current.onGoogleRestore(null);latest.current.notice('');return true;}
  catch(error){latest.current.notice(error instanceof Error?error.message:'Не удалось создать проект.');return false;}
  finally{switching.current=false;setBusy(false);}
 }
 async function importCopy(project:SavedProject,name:string):Promise<boolean>{
  if(training.current||saving.current||switching.current)return false;switching.current=true;setBusy(true);
  let persisted=false;
  try{
   if(!await allowSwitch())return false;
   const copy=projectCopyForImport(project,name,crypto.randomUUID());
   const record=await saveProject(copy,null);persisted=true;await refresh();
   const response=await latest.current.request({type:'project.restore',project:copy});
   if(response.type!=='updated')throw Error('Приложение не открыло созданную копию. Она сохранена в списке проектов.');
   policy.current=new SavePolicy();policy.current.saved(0,Date.now());storedVersion.current=record.updated;setSavedId(record.id);setLastSaved(record.updated);
   await latest.current.request({type:'project.saved',revision:response.document.revision});
   latest.current.onGoogleRestore(copy.google);latest.current.notice('');return true;
  }catch(error){latest.current.notice(`${persisted?'Копия сохранена, но не открылась.':'Не удалось импортировать проект.'} ${error instanceof Error?error.message:'Проверьте файл и доступ к хранилищу.'}`);return false;}
  finally{switching.current=false;setBusy(false);}
 }
 return {recent,busy,savedId,lastSaved,save,open,create,importCopy,changed,actionKey,switching,setTraining};
}
