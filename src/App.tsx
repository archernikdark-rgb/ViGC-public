import type {SourceField} from './engine/node-graph.ts';
import { ParameterDisplayDialog } from './components/ParameterDisplayDialog.tsx';
import { ProjectNameDialog } from './components/ProjectNameDialog.tsx';
import { EntityCreateDialog } from './components/EntityCreateDialog.tsx';
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog.tsx';
import type { SwitchDecision } from './components/UnsavedChangesDialog.tsx';
import { TextField } from './components/TextField.tsx';
import { SheetBindings } from './components/SheetBindings.tsx';
import { useSheetExchange } from './google/useSheetExchange.ts';
import { useProjectFiles } from './persistence/useProjectFiles.ts';
import { ProjectHome } from './components/ProjectHome.tsx';
import { TrainingHub, TutorialOverlay } from './components/Onboarding.tsx';
import { lessonById, type LessonId } from './onboarding/scenarios.ts';
import { buildTrainingSheets, trainingSheetNames } from './onboarding/workbooks.ts';
import { exportLogicYaml } from './workspace/yaml-transfer.ts';
import { useGoogleConnection } from './google/useGoogleConnection.ts';
import { Timeline } from './components/Timeline.tsx';
import { createPlayback } from './engine/playback.ts';
import type { EngineCommand } from './engine/protocol.ts';
import { ContentTree } from './components/ContentTree.tsx';
import type { WorkspaceSelection } from './components/ContentTree.tsx';

import { LinkDialog } from './components/LinkDialog.tsx';
import type { LinkRequest } from './components/LinkDialog.tsx';
import { shapeLabels } from './workspace/geometry.ts';
import packageInfo from '../package.json';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon, IconButton } from './components/Icon.tsx';
import { Divider } from './components/Divider.tsx';
import { Scene } from './components/Scene.tsx';
import { LogicGraph } from './components/LogicGraph.tsx';
import { newDocument } from './workspace/document.ts';
import type { ShapeKind } from './workspace/document.ts';
import { resizeLayout } from './workspace/layout.ts';
import type { EngineRequest, EngineResponse } from './engine/protocol.ts';
import { captureProject } from './persistence/project.ts';

export function App() {
  const [home,setHome]=useState(true);
  const [trainingHub,setTrainingHub]=useState(false);
  const [hubReturnsHome,setHubReturnsHome]=useState(true);
  const [tutorial,setTutorial]=useState<{lessonId:LessonId;stepIndex:number}|null>(null);
  const [tutorialBusy,setTutorialBusy]=useState(false);
  const [tutorialError,setTutorialError]=useState('');
  const [tutorialYaml,setTutorialYaml]=useState('');
  const [trainingWorkbook,setTrainingWorkbook]=useState<{id:string;name:string}|null>(()=>{try{const value=localStorage.getItem('vigc:onboarding:workbook:v1');return value?JSON.parse(value) as {id:string;name:string}:null;}catch{return null;}});
  const trainingAccountReset=useRef(false);
  const trainingOriginalModified=useRef(false);
  const trainingUiBackup=useRef<{selection:WorkspaceSelection;highlight:string|null;panels:typeof panels;layout:typeof layout;timelineExpanded:boolean}|null>(null);
  const trainingUiTransition=useRef<'enter'|'return'|null>(null);
  const [document, setDocument] = useState(newDocument);
  const [playback,setPlayback]=useState(createPlayback);
  const runtimeDocument=playback.frame??document;
  const [highlightContext,setHighlightContext]=useState<string|null>(null);
  const [selection,setSelection]=useState<WorkspaceSelection>({kind:'shapes',ids:[]});
  const selectLogic=useCallback((ids:string[])=>setSelection(current=>current.kind==='logic'&&current.ids.length===ids.length&&current.ids.every((id,i)=>id===ids[i])?current:{kind:'logic',ids}),[]);
  const placement=useRef({x:240,y:230});
  const selectedId=selection.kind==='shapes'?selection.ids.at(-1)??null:null;

  const [history,setHistory]=useState({undo:false,redo:false});
  const [projectSwitch,setProjectSwitch]=useState<{resolve:(decision:SwitchDecision)=>void}|null>(null);
  const [saveName,setSaveName]=useState<{resolve:(name:string|null)=>void}|null>(null);
  const [noteSignal,setNoteSignal]=useState(0);
  const [entityCreate,setEntityCreate]=useState(false);
  const [displayCreate,setDisplayCreate]=useState(false);
  const [showEntities,setShowEntities]=useState(0);
  const [showLayers,setShowLayers]=useState(0);
  const [showEvents,setShowEvents]=useState(0);
  const [linkRequest,setLinkRequest]=useState<LinkRequest|null>(null);
  const [panels,setPanels]=useState({layers:true,scene:true,graph:true});
  const [layout, setLayout] = useState({ sidebar: 280, graph: 440, playback: 260 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [sceneTool, setSceneTool] = useState<'select' | 'hand'>('select');
  const [placementKind,setPlacementKind]=useState<ShapeKind|null>(null);
  const [engineStatus, setEngineStatus] = useState<'connecting' | 'ready' | 'failed'>('connecting');
  const [notice, setNotice] = useState('');
  const [nameDraft, setNameDraft] = useState(document.name);
  const selected = document.shapes.find(shape => shape.id === selectedId);
  const workspace = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const failedRef = useRef(false);
  const queuedCommands = useRef<EngineCommand[]>([]);
  const pending=useRef(new Map<string,{resolve:(response:EngineResponse)=>void;reject:(error:Error)=>void;timeout:number}>());
  const [bindingsOpen,setBindingsOpen]=useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [graphToolbar, setGraphToolbar] = useState<HTMLDivElement | null>(null);
  const [graphActions, setGraphActions] = useState<HTMLDivElement | null>(null);
  const google=useGoogleConnection();
  const files=useProjectFiles({document,request:requestEngine,google:google.state.selection,onGoogleRestore:selection=>{setHome(false);google.connection.restoreSelection(selection);setSelection({kind:'shapes',ids:[]});setLinkRequest(null);setBindingsOpen(false);},notice:setNotice,confirmSwitch:()=>new Promise(resolve=>setProjectSwitch({resolve})),beforeSave:async()=>{if(files.savedId===document.id||document.name!=='untitled')return true;const name=await new Promise<string|null>(resolve=>setSaveName({resolve}));if(!name)return false;await requestEngine({type:'project.rename',name});return true;}});
  const exchange=useSheetExchange({document,playback,connection:google.connection,state:google.state,blocked:()=>files.switching.current||Boolean(document.recording),request:requestSheetCommand});
  async function requestSheetCommand(command:EngineCommand|'capture'){const response=await requestEngine(command);if(command!=='capture'&&response.type==='updated')files.changed(command,files.actionKey(),false);return response;}
  function requestEngine(command:EngineCommand|'capture',actionKey?:string):Promise<EngineResponse>{
    if(!readyRef.current||!workerRef.current)return Promise.reject(Error('Ядро пока недоступно. Повторите действие.'));
    return new Promise((resolve,reject)=>{
      const requestId=crypto.randomUUID();const timeout=window.setTimeout(()=>{pending.current.delete(requestId);reject(Error('Ядро не ответило. Повторите действие.'));},10000);
      pending.current.set(requestId,{resolve,reject,timeout});
      workerRef.current!.postMessage(command==='capture'?{type:'capture',requestId}:{type:'command',requestId,command,actionKey});
    });
  }
  async function openTrainingHub(returnToHome:boolean){
    setHubReturnsHome(returnToHome);setTutorial(null);setTutorialError('');setTrainingHub(true);setHome(false);
  }
  async function startTraining(lessonId:LessonId){
    if(document.recording){setTutorialError('Сначала заверши запись движения, затем начни обучение.');return;}
    setTutorialBusy(true);setTutorialError('');
    try{
      const project=captureProject(newDocument(),createPlayback());
      trainingUiBackup.current={selection,highlight:highlightContext,panels,layout,timelineExpanded};trainingUiTransition.current='enter';
      trainingOriginalModified.current=document.modified;
      const response=await requestEngine({type:'training.start',project,modified:document.modified});
      if(response.type!=='updated')throw Error('Не удалось открыть учебный проект.');
      files.setTraining(true);setSelection({kind:'shapes',ids:[]});setPanels({layers:true,scene:true,graph:true});setTimelineExpanded(false);
      trainingUiTransition.current=null;
      setTutorial({lessonId,stepIndex:0});setTrainingHub(false);setHome(false);setTutorialYaml('');
    }catch(error){trainingUiTransition.current=null;trainingUiBackup.current=null;setTutorialError(error instanceof Error?error.message:'Не удалось запустить кейс.');}
    finally{setTutorialBusy(false);}
  }
  async function leaveTraining(destination:'home'|'hub'){
    setTutorialBusy(true);setTutorialError('');
    trainingUiTransition.current='return';
    try{
      const response=await requestEngine({type:'training.end'});
      if(response.type!=='updated')throw Error('Не удалось вернуть исходный проект. Повтори выход.');
      trainingOriginalModified.current=false;
      files.setTraining(false);setTutorial(null);setTutorialYaml('');setTrainingHub(destination==='hub');setHome(destination==='home'||(destination==='hub'&&hubReturnsHome));
    }catch(error){trainingUiTransition.current=null;setTutorialError(error instanceof Error?error.message:'Не удалось завершить учебный режим.');}
    finally{setTutorialBusy(false);}
  }
  async function ensureTrainingWorkbook(lessonId:LessonId){
    const sheets=buildTrainingSheets(lessonId);if(!sheets.length)return;
    let workbook=trainingWorkbook;
    if(workbook){
      const details=await google.connection.inspectTrainingWorkbook(workbook.id);
      if(!trainingSheetNames.every(name=>details.sheets.includes(name)))throw Error('В учебной таблице не хватает нужных листов. Создай новую таблицу через кнопку ниже.');
      workbook={...workbook,name:details.name};
    }else{
      const details=await google.connection.createTrainingWorkbook('ViGC — учебная таблица',trainingSheetNames,trainingAccountReset.current);
      workbook={id:details.id,name:details.name};
      localStorage.setItem('vigc:onboarding:workbook:v1',JSON.stringify(workbook));setTrainingWorkbook(workbook);trainingAccountReset.current=false;
    }
    await google.connection.writeTrainingSheets(workbook.id,sheets);
    const readback=await google.connection.readTrainingSheets(workbook.id,sheets.map(sheet=>sheet.name));
    const normalize=(rows:(string|number|boolean|null)[][])=>(rows.map(row=>{const copy=[...row];while(copy.at(-1)===''||copy.at(-1)===null||copy.at(-1)===undefined)copy.pop();return copy;}));
    if(readback.length!==sheets.length||sheets.some((sheet,index)=>JSON.stringify(normalize(readback[index]?.values??[]))!==JSON.stringify(normalize(sheet.values))))throw Error('Google принял запись, но проверочное чтение отличается. Открой таблицу и проверь её перед повтором.');
    if(JSON.stringify(workbook)!==JSON.stringify(trainingWorkbook)){localStorage.setItem('vigc:onboarding:workbook:v1',JSON.stringify(workbook));setTrainingWorkbook(workbook);}
  }
  async function advanceTutorial(){
    if(!tutorial)return;const lesson=lessonById(tutorial.lessonId),step=lesson.steps[tutorial.stepIndex]!;
    if(tutorial.stepIndex===lesson.steps.length-1){await leaveTraining('hub');return;}
    setTutorialBusy(true);setTutorialError('');
    try{
      if(step.workbook)await ensureTrainingWorkbook(tutorial.lessonId);
      const next=lesson.steps[tutorial.stepIndex+1]!;
      for(const command of next.commands??[]){const response=await requestEngine(command);if(response.type!=='updated')throw Error('Ядро не подтвердило команду шага.');}
      if(next.tab==='entities')setShowEntities(value=>value+1);
      if(next.tab==='layers')setShowLayers(value=>value+1);
      if(next.tab==='events')setShowEvents(value=>value+1);
      if(next.run&&!next.commands?.some(command=>command.type==='playback.play')){const response=await requestEngine({type:'playback.play'});if(response.type!=='updated')throw Error('Не удалось запустить учебное проигрывание.');}
      setTutorial(current=>current?{...current,stepIndex:current.stepIndex+1}:current);
    }catch(error){setTutorialError(error instanceof Error?error.message:'Не удалось выполнить шаг. Повтори его ещё раз.');}
    finally{setTutorialBusy(false);}
  }
  function exportTutorialYaml(){
    try{
      const source=exportLogicYaml(document,document.logic.nodes.map(node=>node.id));setTutorialYaml(source);
      const url=URL.createObjectURL(new Blob([source],{type:'application/yaml'}));const link=window.document.createElement('a');link.href=url;link.download='vigc-detection-logic.yaml';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){setTutorialError(error instanceof Error?error.message:'Не удалось экспортировать YAML.');}
  }
  function resetTrainingWorkbook(){
    localStorage.removeItem('vigc:onboarding:workbook:v1');setTrainingWorkbook(null);trainingAccountReset.current=true;setTutorialError('На следующем шаге выбери аккаунт Google, где создать новую учебную таблицу.');
  }
  async function connectGoogle(){const previous=google.state.selection;await google.connection.connect();const next=google.connection.state.selection;if(JSON.stringify(previous)!==JSON.stringify(next))sendCommand({type:'project.touch'});}
  async function disconnectGoogle(){const hadSelection=Boolean(google.state.selection);await google.connection.disconnect();if(hadSelection)sendCommand({type:'project.touch'});}

  useEffect(() => setNameDraft(document.name), [document.id, document.name]);
  useEffect(() => {
    if(trainingUiTransition.current==='return'&&trainingUiBackup.current){const backup=trainingUiBackup.current;setSelection(backup.selection);setHighlightContext(backup.highlight);setPanels(backup.panels);setLayout(backup.layout);setTimelineExpanded(backup.timelineExpanded);trainingUiBackup.current=null;trainingUiTransition.current=null;}
    else {setSelection({kind:'shapes',ids:[]});setHighlightContext(null);setLinkRequest(null);if(trainingUiTransition.current==='enter')trainingUiTransition.current=null;}
  }, [document.id]);
  useEffect(()=>{
    if(!tutorial)return;
    const focus=lessonById(tutorial.lessonId).steps[tutorial.stepIndex]?.focus;
    if(focus==='timeline')setTimelineExpanded(true);
    if(focus!=='menu')return;
    const menu=window.document.querySelector<HTMLDetailsElement>('details.project-menu');if(!menu)return;
    const wasOpen=menu.open;menu.open=true;return()=>{if(!wasOpen)menu.open=false;};
  },[tutorial?.lessonId,tutorial?.stepIndex]);
  useEffect(() => {
    const requestId = crypto.randomUUID();
    const worker = new Worker(new URL('./engine/engine.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const timeout = window.setTimeout(() => {
      failedRef.current = true;
      queuedCommands.current = [];
      setEngineStatus('failed');
      setNotice('Ядро не ответило за 5 секунд. Повторите действие после восстановления связи.');
    }, 5000);
    worker.onmessage = (event: MessageEvent<EngineResponse>) => {
      const response = event.data;
      if (response.type === 'ready') {
        if (response.requestId !== requestId || response.protocolVersion !== 4) return;
        window.clearTimeout(timeout);
        failedRef.current = false;
        readyRef.current = true;
        setEngineStatus('ready');
        setPlayback(response.playback);
        setNotice('');
        setDocument(current => response.document.revision >= current.revision ? response.document : current);
        queuedCommands.current.splice(0).forEach(command => worker.postMessage({
          type: 'command', requestId: crypto.randomUUID(), command,
        } satisfies EngineRequest));
        return;
      }
      const waiter=pending.current.get(response.requestId);if(waiter){clearTimeout(waiter.timeout);pending.current.delete(response.requestId);if(response.type==='rejected')waiter.reject(Error(response.message));else waiter.resolve(response);}
      if(response.type==='captured')return;
      if (response.type === 'updated') {
        if(response.history)setHistory(response.history);
        setPlayback(response.playback);
        setDocument(current => response.document.revision >= current.revision ? response.document : current);
      } else {
        setNotice(response.message);
      }
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      readyRef.current = false;
      failedRef.current = true;
      queuedCommands.current = [];
      setEngineStatus('failed');
      pending.current.forEach(waiter=>{clearTimeout(waiter.timeout);waiter.reject(Error('Связь с ядром потеряна. Проект не подтверждён как сохранённый.'));});pending.current.clear();
    };
    worker.postMessage({ type: 'ping', requestId });
    return () => {
      window.clearTimeout(timeout);
      readyRef.current = false;
      workerRef.current = null;
      worker.terminate();
      pending.current.forEach(waiter=>{clearTimeout(waiter.timeout);waiter.reject(Error('Ядро остановлено.'));});pending.current.clear();
    };
  }, []);
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input,textarea,select,button,summary,dialog,[contenteditable="true"]')) return;
      if (event.code === 'Space') { event.preventDefault(); setSpacePressed(true); }
    };
    const release = (event: KeyboardEvent) => { if (event.code === 'Space') setSpacePressed(false); };
    const blur = () => setSpacePressed(false);
    window.addEventListener('keydown', press); window.addEventListener('keyup', release); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', press); window.removeEventListener('keyup', release); window.removeEventListener('blur', blur); };
  }, []);
  useEffect(() => {
    if(tutorial?!trainingOriginalModified.current:!document.modified)return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [document.modified,tutorial]);
  useEffect(() => {
    const closeOutside = (event: globalThis.PointerEvent) => {
      window.document.querySelectorAll<HTMLDetailsElement>('details.popover-anchor[open]').forEach(menu => {
        if (!menu.classList.contains('node-catalog')&&!menu.contains(event.target as Node)) menu.open = false;
      });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPlacementKind(null);
      if (document.recording) sendCommand({type:'path.cancel'});
      window.document.querySelectorAll<HTMLDetailsElement>('details.popover-anchor[open]').forEach(menu => {
        menu.open = false;
        menu.querySelector<HTMLElement>('summary')?.focus();
      });
    };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => { window.removeEventListener('pointerdown', closeOutside); window.removeEventListener('keydown', closeOnEscape); };
  }, [Boolean(document.recording)]);
  useEffect(()=>{
    if(playback.status!=='playing')return;
    let last=performance.now();
    const timer=window.setInterval(()=>{const now=performance.now();const seconds=Math.min(1,(now-last)/1000);last=now;sendCommand({type:'playback.advance',seconds});},100);
    const pauseHidden=()=>{if(window.document.hidden)sendCommand({type:'playback.pause'});};
    window.document.addEventListener('visibilitychange',pauseHidden);
    return ()=>{window.clearInterval(timer);window.document.removeEventListener('visibilitychange',pauseHidden);};
  },[playback.status]);
  function sendCommand(command: EngineCommand) {
    if(playback.debugging&&command.type==='parameter.update'&&command.update.value!==undefined)command={type:'debug.parameter',id:command.id,value:command.update.value};
    if(playback.debugging&&command.type==='behavior.fire')command={type:'debug.fire',nodeId:command.nodeId};
    if(files.switching.current){setNotice('Дождитесь открытия проекта.');return;}
    if(!readyRef.current&&!failedRef.current){queuedCommands.current.push(command);return;}
    const record=command.type==='parameter.update'?document.parameters.find(v=>v.id===command.id):command.type==='shape.update'?document.shapes.find(v=>v.id===command.id):null;
    if(record&&'update' in command&&Object.entries(command.update).every(([key,value])=>Reflect.get(record,key)===value))return;
    const key=files.actionKey(),recording=Boolean(document.recording);
    void requestEngine(command,key).then(response=>{if(response.type==='updated')files.changed(command,key,recording);}).catch(error=>setNotice(error.message));
  }

  function requestLink(kind:'entity'|'parameter',id:string,shapeId?:string) {setLinkRequest({kind,id,shapeId});}
  function removeSelection() {
    if(!selection.ids.length)return;
    sendCommand({type:'selection.remove',shapeIds:selection.kind==='shapes'?selection.ids:[],entityIds:selection.kind==='entities'?selection.ids:[],nodeIds:selection.kind==='logic'?selection.ids:[],groupIds:selection.kind==='groups'?selection.ids:[]});
    setSelection({kind:'shapes',ids:[]});
  }
  function groupSelection(ungroup=false) {
    if(!selection.ids.length)return;
    if(selection.kind==='logic') {
      if(ungroup&&selection.ids.length===1)sendCommand({type:'logic.ungroup',id:selection.ids[0]});
      else if(!ungroup&&selection.ids.length)sendCommand({type:'logic.group',id:crypto.randomUUID(),nodeIds:selection.ids,name:'Группа'});
    }else if(selection.kind==='entities') {
      if(ungroup)selection.ids.forEach(id=>{if(document.entities.find(e=>e.id===id)?.folder)sendCommand({type:'entity.ungroup',id});else sendCommand({type:'entity.reparent',ids:[id],parentId:null});});
      else sendCommand({type:'entity.group',id:crypto.randomUUID(),ids:selection.ids,name:'Группа'});
    }else if(selection.kind==='groups'&&ungroup)selection.ids.forEach(id=>sendCommand({type:'scene.ungroup',id}));
    else if(!ungroup)sendCommand({type:'scene.wrap',id:crypto.randomUUID(),shapeIds:selection.kind==='shapes'?selection.ids:[],groupIds:selection.kind==='groups'?selection.ids:[],name:'Группа'});
  }
  function createShape(kind: ShapeKind, position=placement.current, geometry?:Partial<Pick<import('./workspace/document.ts').SceneShape,'width'|'height'|'radius'|'innerRadius'|'rotation'>>) {
    const id = crypto.randomUUID();
    sendCommand({ type: 'shape.add', kind, id, position, geometry });
    setSelection({kind:'shapes',ids:[id]});setSceneTool('select');setPlacementKind(null);setShowLayers(n=>n+1);
  }
  function armShape(kind:ShapeKind){setSceneTool('select');setPlacementKind(kind);}
  function createSources(position={x:40,y:40},parentId?:string){
    const fields:SourceField[]=[];
    const selectedShapes=document.shapes.filter(s=>selection.kind==='shapes'?selection.ids.includes(s.id):selection.kind==='entities'&&s.entityId&&selection.ids.includes(s.entityId));
    const parameterIds=new Set([...document.parameters.filter(p=>selection.kind==='entities'&&selection.ids.includes(p.ownerId)).map(p=>p.id),...selectedShapes.flatMap(s=>s.displayParameterId?[s.displayParameterId]:[])]);
    for(const shape of selectedShapes)if(['point','circle','chart','rectangle','polygon'].includes(shape.kind))fields.push({id:crypto.randomUUID(),label:shape.name,type:shape.kind==='point'?'point':'area',referenceId:shape.id});
    for(const p of document.parameters.filter(p=>parameterIds.has(p.id)))fields.push({id:crypto.randomUUID(),label:p.name,type:'number',referenceId:p.id});
    const id=crypto.randomUUID();sendCommand({type:'logic.replace',logic:{...document.logic,nodes:[...document.logic.nodes,{id,type:'draft',position,...(parentId?{parentId}:{}),data:{role:'calculate',label:'Источники',graph:{operation:'sources',fields}}}]}});setSelection({kind:'logic',ids:[id]});setPanels(current=>({...current,graph:true}));
  }
  function createEvent() {
    let index=1;while(document.logic.nodes.some(node=>node.data.label===`Событие ${index}`))index++;
    const id=crypto.randomUUID(),position={x:document.logic.nodes.reduce((right,node)=>Math.max(right,node.position.x+350),80),y:80};
    sendCommand({type:'logic.replace',logic:{...document.logic,nodes:[...document.logic.nodes,{id,type:'draft',position,data:{role:'event',label:`Событие ${index}`,graph:{operation:'event'}}}]}});
    setSelection({kind:'logic',ids:[id]});setPanels(current=>({...current,graph:true}));setShowEvents(value=>value+1);
  }
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      if(home||trainingHub||tutorial)return;
      const target=event.target;
      if(target instanceof Element&&(target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],dialog')||window.document.querySelector('dialog[open]')))return;
      if(event.repeat||event.altKey)return;
      if(event.metaKey||event.ctrlKey){
        if(event.code==='KeyZ'){event.preventDefault();event.stopPropagation();if(event.shiftKey?history.redo:history.undo)sendCommand({type:event.shiftKey?'history.redo':'history.undo'});}
        if(event.code==='KeyG'){event.preventDefault();event.stopPropagation();groupSelection(event.shiftKey);}
        if(event.code==='KeyD'&&selection.kind==='shapes'&&selection.ids.length){event.preventDefault();sendCommand({type:'scene.duplicate',shapeIds:selection.ids,copyId:crypto.randomUUID()});}
        if(event.shiftKey&&event.code==='KeyL'&&selection.kind==='shapes'){event.preventDefault();for(const id of selection.ids){const shape=document.shapes.find(s=>s.id===id);if(shape)sendCommand({type:'shape.update',id,update:{geometryLocked:!shape.geometryLocked}});}}
        if(event.shiftKey&&event.code==='BracketRight'&&selection.kind==='shapes'){event.preventDefault();for(const id of selection.ids)sendCommand({type:'scene.order',id,beforeId:null});}
        if(event.code==='KeyS'){event.preventDefault();event.stopPropagation();void files.save();}
        return;
      }
      if((event.code==='Delete'||event.code==='Backspace')&&selection.ids.length){event.preventDefault();event.stopPropagation();removeSelection();return;}
      if(event.code==='KeyB'){event.preventDefault();if(!playback.debugging&&!document.recording)createEvent();return;}
      if(event.code==='KeyE'){event.preventDefault();setEntityCreate(true);return;}
      if(event.code==='KeyC'){event.preventDefault();setNoteSignal(n=>n+1);return;}
      if(event.code==='KeyV'){setSceneTool('select');setPlacementKind(null);}
      if(event.code==='KeyH'){setSceneTool('hand');setPlacementKind(null);}
      const kinds:Record<string,ShapeKind>={KeyO:'circle',KeyR:'rectangle',KeyP:'polygon',KeyA:'arrow',KeyD:'chart',Period:'point'};
      if(kinds[event.code]){event.preventDefault();armShape(kinds[event.code]);}
    };
    window.addEventListener('keydown',keydown,true);return ()=>window.removeEventListener('keydown',keydown,true);
  });
  useEffect(()=>{setSelection(current=>{const records=current.kind==='shapes'?document.shapes:current.kind==='entities'?document.entities:current.kind==='groups'?document.sceneGroups:document.logic.nodes;const ids=current.ids.filter(id=>records.some(r=>r.id===id));return ids.length===current.ids.length?current:{...current,ids};});},[document.shapes,document.entities,document.sceneGroups,document.logic.nodes]);
  const debugButton=<button className="icon-button" aria-label={playback.debugging?'Выйти из проверки':'Перейти в проверку'} title={playback.debugging?'Выйти из проверки и сбросить проверочные изменения':'Проверить собранную схему; изменения проверки сбросятся при выходе'} aria-pressed={playback.debugging} disabled={Boolean(document.recording)||engineStatus!=='ready'} onClick={()=>sendCommand({type:playback.debugging?'debug.stop':'debug.start'})}><Icon name="bug"/></button>;
  let entityNumber=1;while(document.entities.some(entity=>entity.name===`Сущность ${entityNumber}`))entityNumber++;
  const style = { '--sidebar': `${layout.sidebar}px`, '--graph': `${layout.graph}px`, '--playback': `${layout.playback}px` } as CSSProperties;
  if(trainingHub)return <TrainingHub busy={tutorialBusy} error={tutorialError} onStart={id=>void startTraining(id)} onBack={()=>{setTutorialError('');setTrainingHub(false);setHome(hubReturnsHome);}}/>;
  if(home)return <>
    <ProjectHome
      projects={files.recent}
      busy={files.busy}
      engineReady={engineStatus==='ready'}
      currentModified={document.modified}
      notice={notice}
      onCreate={async()=>{if(await files.create())setHome(false);}}
      onOpen={id=>void files.open(id)}
      onImport={async (project,name)=>{
        const imported=await files.importCopy(project,name);
        if(imported)setHome(false);
        return imported;
      }}
      onContinue={()=>setHome(false)}
      onTraining={()=>void openTrainingHub(true)}
    />
    {projectSwitch&&<UnsavedChangesDialog onDecision={decision=>{projectSwitch.resolve(decision);setProjectSwitch(null);}}/>}
    {saveName&&<ProjectNameDialog onDecision={name=>{saveName.resolve(name);setSaveName(null);}}/>}
  </>;
  return <div className="app">
    <header className="app-header"><div className="project-identity"><strong className="wordmark">ViGC</strong><input aria-label="Название проекта" value={nameDraft} onChange={e=>setNameDraft(e.target.value)} onBlur={()=>{const name=nameDraft.trim()||'untitled';setNameDraft(name);if(name!==document.name)sendCommand({type:'project.rename',name});}}/>
      <button className="icon-button save-control" aria-label={files.busy?'Сохранение':document.modified||files.savedId!==document.id?'Сохранить изменения':'Сохранено'} title={files.busy?'Сохранение':document.modified||files.savedId!==document.id?'Сохранить изменения':'Сохранено'} disabled={Boolean(tutorial)||files.busy||Boolean(document.recording)||engineStatus!=='ready'} onClick={()=>void files.save()}><Icon name="save"/>{(document.modified||files.savedId!==document.id)&&<span className="save-dot"/>}</button>
      <button className="icon-button" aria-label={google.state.status==='connected'?'Таблица подключена: привязки':'Подключить таблицу Google'} title={google.state.status==='connected'?google.state.selection?.name:'Подключить таблицу Google'} aria-pressed={google.state.status==='connected'} disabled={Boolean(tutorial)||files.busy||['unconfigured','loading','authorizing','choosing','checking'].includes(google.state.status)} onClick={()=>google.state.status==='connected'?setBindingsOpen(true):void connectGoogle()}><Icon name="table"/></button>
      {[...exchange.states.values()].some(s=>s.status==='conflict'||s.status==='error')&&<button className="icon-button" aria-label="Таблица требует внимания" title="Таблица требует внимания" onClick={()=>setBindingsOpen(true)}>!</button>}
    </div>
    <nav className="global-toolbar" aria-label="Инструменты рабочего пространства">
      <IconButton icon="undo" label="Отменить (⌘/Ctrl Z)" disabled={!history.undo||Boolean(document.recording)} onClick={()=>sendCommand({type:'history.undo'})}/><IconButton icon="redo" label="Повторить (⇧ ⌘/Ctrl Z)" disabled={!history.redo||Boolean(document.recording)} onClick={()=>sendCommand({type:'history.redo'})}/><span className="tool-separator"/>
      <button className="icon-button" title="Выбор (V)" aria-label="Выбор (V)" aria-pressed={sceneTool==='select'&&!placementKind} onClick={()=>{setSceneTool('select');setPlacementKind(null);}}><Icon name="cursor"/></button><button className="icon-button" title="Перемещение холста (H / пробел)" aria-label="Перемещение холста (H / пробел)" aria-pressed={sceneTool==='hand'} onClick={()=>{setSceneTool('hand');setPlacementKind(null);}}><Icon name="hand"/></button>
      <span className="tool-separator"/><IconButton icon="counter" label="Показать значение параметра" onClick={()=>setDisplayCreate(true)}/>{debugButton}<span className="tool-separator"/>
      <details className="popover-anchor"><summary className={`icon-button ${placementKind?'tool-active':''}`} aria-label="Добавить фигуру" title={placementKind?`Разместить: ${shapeLabels[placementKind]}`:'Добавить фигуру'}><Icon name="plus"/></summary><div className="popover">{(['circle','point','rectangle','polygon','chart','arrow'] as const).map(kind=><button key={kind} onClick={event=>{armShape(kind);event.currentTarget.closest('details')?.removeAttribute('open');}}>{shapeLabels[kind]}<kbd>{{circle:'O',point:'.',rectangle:'R',polygon:'P',chart:'D',arrow:'A'}[kind]}</kbd></button>)}</div></details>
      <IconButton icon="userPlus" label="Создать сущность (E)" onClick={()=>setEntityCreate(true)}/>
      <IconButton icon="bolt" label="Создать событие (B)" disabled={playback.debugging||Boolean(document.recording)} onClick={createEvent}/>
      <div ref={setGraphToolbar} className="toolbar-group"/><span className="tool-separator"/>
      <IconButton icon="folder" label="Группировать выделение (⌘/Ctrl G)" disabled={!selection.ids.length} onClick={()=>groupSelection()}/>
      <IconButton icon="comment" label="Комментарий на схеме (C)" onClick={()=>setNoteSignal(n=>n+1)}/>
      <IconButton icon="trash" label="Удалить выделение (Delete)" disabled={!selection.ids.length||Boolean(document.recording)} onClick={removeSelection}/>
    </nav><div className="header-actions" data-onboarding-focus="menu">      <details className="popover-anchor project-menu"><summary className="icon-button" aria-label="Меню проекта" title="Меню проекта"><Icon name="menu"/></summary><div className="popover" onClick={event=>{if(event.target instanceof Element&&event.target.closest('button:not(:disabled),a'))event.currentTarget.closest('details.project-menu')?.removeAttribute('open');}}>
        <button disabled={Boolean(tutorial)} onClick={()=>setHome(true)}>Мои проекты</button><button disabled={Boolean(tutorial)||files.busy} onClick={()=>void files.create()}>Новый проект</button>
        <button onClick={()=>void openTrainingHub(false)}>Пройти обучение</button>
        <button disabled={Boolean(tutorial)||files.busy||Boolean(document.recording)||engineStatus!=='ready'} onClick={()=>void files.save()}>Сохранить</button>
        <details><summary>Открыть проект</summary>{files.recent.length===0?<small>В этом браузере пока нет сохранённых проектов.</small>:files.recent.map(project=><button key={project.id} disabled={files.busy} onClick={()=>void files.open(project.id)}>{project.name} · {new Date(project.updated).toLocaleString()}</button>)}</details>
        <hr/>
        <button disabled={Boolean(tutorial)||['unconfigured','loading','authorizing','choosing','checking'].includes(google.state.status)||files.busy} onClick={()=>void connectGoogle()}>{google.state.status==='loading'?'Загрузка Google…':['authorizing','choosing','checking'].includes(google.state.status)?'Подключение Google…':'Подключить таблицу Google'}</button>
        {google.state.status==='error'&&<button onClick={()=>void google.connection.prepare()}>Повторить загрузку Google</button>}
        {google.state.selection&&<><small>{google.state.selection.name}{google.state.status==='connected'?` · ${google.state.sheets.join(', ')}`:' · доступ не подтверждён'}</small><a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(google.state.selection.id)}/edit`} target="_blank" rel="noreferrer">Открыть таблицу</a><button disabled={Boolean(tutorial)||files.busy} onClick={()=>void disconnectGoogle()}>Отключить таблицу</button></>}
        <button onClick={()=>setBindingsOpen(true)} disabled={Boolean(tutorial)||files.busy}>Привязки Google Sheets ({document.sheets.length})</button>
        <div ref={setGraphActions} className="project-graph-actions"/>
        {google.state.message&&<small role="status">{google.state.message}</small>}
        <small>ViGC {packageInfo.version} · Данные сохраняются только в этом браузере.</small>
      </div></details>
</div></header>
    {projectSwitch&&<UnsavedChangesDialog onDecision={decision=>{projectSwitch.resolve(decision);setProjectSwitch(null);}}/>}
    {saveName&&<ProjectNameDialog onDecision={name=>{saveName.resolve(name);setSaveName(null);}}/>}
    {bindingsOpen&&<SheetBindings key={document.id} document={document} playback={playback} state={google.state} connection={google.connection} exchange={exchange} onClose={()=>setBindingsOpen(false)} onSave={async bindings=>{await requestSheetCommand({type:'sheets.bindings',bindings});}}/>}
    {entityCreate&&<EntityCreateDialog defaultName={`Сущность ${entityNumber}`} onClose={()=>setEntityCreate(false)} onCreate={(command,id)=>{sendCommand(command);setSelection({kind:'entities',ids:[id]});setShowEntities(n=>n+1);}}/>}
    {displayCreate&&<ParameterDisplayDialog document={document} onClose={()=>setDisplayCreate(false)} onCreate={parameterId=>{const id=crypto.randomUUID();sendCommand({type:'display.add',id,parameterId,position:placement.current});setSelection({kind:'shapes',ids:[id]});setDisplayCreate(false);}}/>}
    {linkRequest&&<LinkDialog key={`${linkRequest.kind}-${linkRequest.id}`} request={linkRequest} document={document} onCommand={sendCommand} onLinked={id=>{if(linkRequest.position){setSelection({kind:'shapes',ids:[id]});setShowLayers(n=>n+1);}}} onClose={()=>setLinkRequest(null)}/>}
    <div className={`workspace ${panels.layers?'':'hide-layers'} ${panels.scene?'':'hide-scene'} ${panels.graph?'':'hide-graph'}`} ref={workspace} style={style} data-onboarding-focus="workspace">
      <aside className="inspector" data-onboarding-focus="sidebar"><div className="inspector-content glass-panel"><ContentTree highlightContext={highlightContext} onHighlightContext={setHighlightContext} showEntities={showEntities} showLayers={showLayers} showEvents={showEvents} readOnlyValues={playback.status==='playing'} debugValues={playback.debugging} document={runtimeDocument} sourceDocument={document} selection={selection} onSelect={next=>{setSelection(next);if(next.kind==='logic')setPanels(current=>({...current,graph:true}));}} onCommand={sendCommand} onDebugValue={(id,value)=>sendCommand({type:'debug.parameter',id,value})} onLink={requestLink}/></div></aside>
      <Divider controls={[{label:panels.layers?'Свернуть слои':'Развернуть слои',symbol:panels.layers?'‹':'›',onClick:()=>setPanels(current=>({...current,layers:!current.layers}))}]} name="sidebar" value={layout.sidebar} onResize={(name, delta) => setLayout(current => resizeLayout(current, name, delta, workspace.current!.clientWidth, workspace.current!.clientHeight))} />
      <main className="editors">
        <div className="editor-row"><section className="panel scene-panel" data-onboarding-focus="scene"><div className="panel-heading"><h2>Холст</h2><span className="quiet selection-label">{selected?.name}</span><span className="header-spacer" />{selection.kind==='groups'&&selection.ids.map(id=>{const group=document.sceneGroups.find(g=>g.id===id);return group?<div key={id} className="group-context"><TextField label="Название группы" value={group.name} onChange={name=>sendCommand({type:'scene.rename',id,name})}/><button onClick={()=>sendCommand({type:'scene.duplicate',shapeIds:group.shapeIds,copyId:crypto.randomUUID()})}>Дублировать группу</button><button onClick={()=>sendCommand({type:'scene.ungroup',id})}>Расформировать</button></div>:null;})}
        </div><Scene fitSceneKey={tutorial?.lessonId==='detection'&&tutorial.stepIndex>=2?'detection-case':null} placementKind={placementKind} onPlace={(position,geometry)=>{if(placementKind)createShape(placementKind,position,geometry);}} liveInteraction={playback.debugging} interactionLocked={playback.debugging&&playback.status==='playing'} onDebugValue={(id,value)=>sendCommand({type:'debug.parameter',id,value})} highlightedEntityIds={document.logic.nodes.find(n=>n.id===highlightContext&&n.data.role==='context')?.data.contextEntityIds??[]} document={runtimeDocument} shapes={runtimeDocument.shapes} selectedId={selectedId} onPlacement={position=>{placement.current=position;}} onSelect={(id,multiple=false)=>setSelection(current=>({kind:'shapes',ids:id?(multiple&&current.kind==='shapes'?current.ids.includes(id)?current.ids.filter(i=>i!==id):[...current.ids,id]:[id]):[]}))} selectedIds={selection.kind==='shapes'?selection.ids:[]} onCommand={sendCommand} onDropItem={(item,position)=>{if(item.kind==='entity'||item.kind==='parameter')setLinkRequest({kind:item.kind,id:item.id,position});}} spacePressed={spacePressed || sceneTool === 'hand'}
          onResize={(id, radius) => sendCommand({ type: 'shape.update', id, update: { radius } })}
          onMove={(id, x, y) => playback.debugging ? sendCommand({type:'debug.move',id,x,y}) : sendCommand({ type: 'shape.update', id, update: { x, y } })} /></section>
          <Divider controls={[{label:panels.scene?'Свернуть холст':'Развернуть холст',symbol:panels.scene?'‹':'›',disabled:!panels.graph,onClick:()=>setPanels(current=>({...current,scene:!current.scene}))},{label:panels.graph?'Свернуть схему':'Развернуть схему',symbol:panels.graph?'›':'‹',disabled:!panels.scene,onClick:()=>setPanels(current=>({...current,graph:!current.graph}))}]} name="graph" value={layout.graph} onResize={(name, delta) => setLayout(current => resizeLayout(current, name, delta, workspace.current!.clientWidth, workspace.current!.clientHeight))} />
          <LogicGraph onCreateSources={createSources} checking={playback.debugging} noteSignal={noteSignal} key={document.id} selectedIds={selection.kind==='logic'?selection.ids:[]} onSelected={selectLogic} onSelectShape={id=>setSelection({kind:'shapes',ids:[id]})} toolbar={graphToolbar} actionsMenu={graphActions} spacePressed={spacePressed} modelNodes={document.logic.nodes} modelEdges={document.logic.edges}
            document={runtimeDocument} onCommand={sendCommand} onImport={(source,parentId)=>sendCommand({type:'logic.import-yaml',source,copyId:crypto.randomUUID(),parentId})}
            onChange={logic => sendCommand({ type: 'logic.replace', logic })} />
        </div>
        {timelineExpanded && <Divider name="playback" value={layout.playback} onResize={(name, delta) => setLayout(current => resizeLayout(current, name, delta, workspace.current!.clientWidth, workspace.current!.clientHeight))} />}
        <section className={`panel playback ${timelineExpanded ? "" : "playback-collapsed"}`} aria-label="Проигрывание" data-onboarding-focus="timeline"><div className="section-heading playback-heading"><h2>Проигрывание</h2><span role="status" className={`engine-status ${engineStatus}`}>{ { connecting: 'Подключение ядра…', ready: '', failed: 'Ядро недоступно. Перезагрузите страницу.' }[engineStatus] }</span><span className="header-spacer"/><IconButton icon="chevronDown" label="Свернуть таймлайн" onClick={() => setTimelineExpanded(false)} /></div>
          {!timelineExpanded && <div className="compact-playback"><IconButton icon={playback.status === 'playing' ? 'pause' : 'play'} primary label={playback.status === 'playing' ? 'Пауза' : 'Пуск'} disabled={Boolean(document.recording)||engineStatus!=='ready'} onClick={() => sendCommand({type: playback.status === 'playing' ? 'playback.pause' : 'playback.play'})}/><output aria-label="Текущий тик">Тик {playback.time.toFixed(2)} / {playback.duration}</output><IconButton icon="chevronUp" label="Развернуть таймлайн" onClick={() => setTimelineExpanded(true)}/></div>}
          <div className="timeline-body" hidden={!timelineExpanded}><Timeline playback={playback} document={runtimeDocument} disabled={Boolean(document.recording)||engineStatus!=='ready'} onCommand={sendCommand}/></div>
        </section>
      </main>
    </div>{notice && <button className="notice" onClick={() => setNotice('')} aria-label="Закрыть уведомление">{notice}</button>}
    {tutorial&&<TutorialOverlay lesson={lessonById(tutorial.lessonId)} stepIndex={tutorial.stepIndex} busy={tutorialBusy} error={tutorialError} workbook={trainingWorkbook} yaml={tutorialYaml} onNext={()=>void advanceTutorial()} onExit={()=>void leaveTraining('home')} onSwitch={()=>void leaveTraining('hub')} onExport={exportTutorialYaml} onResetWorkbook={resetTrainingWorkbook}/ >}
  </div>;
}
