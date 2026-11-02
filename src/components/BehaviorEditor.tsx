import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {IconButton} from './Icon.tsx';
import { BehaviorValueEditor } from './BehaviorValueEditor.tsx';
import { CalculationEditor } from './CalculationEditor.tsx';
import { groupPorts } from '../workspace/composition.ts';
import type { WorkspaceDocument, WorkspaceCommand, LogicNode } from '../workspace/document.ts';
import type { EventDefinition, ActionDefinition } from '../engine/behavior.ts';
import {spatialLabels,spatialTrace} from '../engine/spatial.ts';
import {readParameterValue} from '../engine/calculations.ts';
import type { SpatialDefinition } from '../engine/spatial.ts';
import type { IconName } from './Icon.tsx';
import { NumericField } from './NumericField.tsx';
export const roleLabels: Record<LogicNode['data']['role'],string> = { note:'Комментарий',event:'Событие',context:'Контекст',read:'Чтение параметров',calculate:'Вычисление',variable:'Переменная',group:'Собственный блок',condition:'Условие',action:'Действие',spatial:'Пространство',repeat:'Повтор' };
export const roleIcons: Record<LogicNode['data']['role'],IconName> = { note:'comment',event:'bolt',context:'eventTag',read:'link',calculate:'function',variable:'variable',group:'folder',condition:'branch',action:'transform',spatial:'marker',repeat:'loop' };
function Choice({label,value,options,onChange}:{label:string;value:string;options:{id:string;name:string}[];onChange:(id:string)=>void}) {
  return <label className="field">{label}<select className={!value?'missing-input':undefined} value={value} onChange={e=>onChange(e.target.value)}><option value="">Выберите</option>
    {value && !options.some(o=>o.id===value) && <option disabled value={value}>Источник удалён</option>}
    {options.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
  </select></label>;
}
export function BehaviorEditor({node,document,onCommand,onSelectShape,checking=false}:{node:LogicNode;document:WorkspaceDocument;onCommand:(command:WorkspaceCommand)=>void;onSelectShape?:(id:string)=>void;checking?:boolean}) {
  const [eventSettings,setEventSettings]=useState(false);
  const eventDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(eventSettings)eventDialog.current?.showModal();return()=>eventDialog.current?.close();},[eventSettings]);
  const event = node.data.event ?? {trigger:'manual'};
  const action = node.data.action ?? {operation:'set',targetId:''};
  const spatial = node.data.spatial ?? {operation:'position',originId:''};
  const configure = (configuration: Pick<LogicNode['data'],'event'|'action'|'spatial'>) => onCommand({type:'behavior.configure',nodeId:node.id,configuration});
  const points = document.shapes.filter(s=>s.kind==='point'), circles = document.shapes.filter(s=>s.kind==='circle');
  const result = document.evaluations[`node:${node.id}`];
  const execution = document.behavior.results[node.id];
  const simpleActionValue=node.data.role==='action'&&action.operation!=='path'&&/^-?\d+(?:\.\d+)?$/.test((node.data.calculation?.expression??'').trim());
  return <div className="node-reading nodrag nopan nowheel">
    {node.data.role==='event' && <><div className="event-node-summary"><span>{({manual:'По вызову',condition:'По условию',enter:'Вход в область',inside:'Внутри области',leave:'Выход из области',visibility:'Цель видна'})[event.trigger]}</span><IconButton icon="settings" label="Настроить событие" onClick={()=>setEventSettings(true)}/></div>{eventSettings&&createPortal(<dialog ref={eventDialog} className="entity-create-dialog event-settings-dialog" onCancel={()=>setEventSettings(false)}><div className="section-heading"><h2>{node.data.label}</h2><button className="icon-button" aria-label="Закрыть настройки события" onClick={()=>setEventSettings(false)}>×</button></div>
      <fieldset disabled={checking} className="event-settings-fields"><label className="field">Когда возникает<select value={event.trigger} onChange={e=>configure({event:{...event,trigger:e.target.value as EventDefinition['trigger']}})}>
        <option value="manual">По вызову</option><option value="condition">Условие стало истинным</option><option value="enter">Вход в область</option><option value="inside">Внутри области</option><option value="leave">Выход из области</option><option value="visibility">Цель видна, с учётом преград</option>
      </select></label>
      {event.trigger==='visibility'&&<><Choice label="Наблюдатель" value={event.observerId??''} options={points} onChange={observerId=>configure({event:{...event,observerId}})}/><Choice label="Цель" value={event.targetId??''} options={points} onChange={targetId=>configure({event:{...event,targetId}})}/><Choice label="Сектор обзора" value={event.zoneId??''} options={document.shapes.filter(s=>s.kind==='chart')} onChange={zoneId=>configure({event:{...event,zoneId}})}/><Choice label="Группа преград" value={event.obstacleGroupId??''} options={document.sceneGroups} onChange={obstacleGroupId=>configure({event:{...event,obstacleGroupId}})}/><small>Событие возникает, пока цель находится в секторе и луч до неё не пересекает преграду.</small></>}
      {!['manual','condition','visibility'].includes(event.trigger) && <>{!document.logic.edges.some(e=>e.target===node.id&&e.targetHandle==='point')&&<Choice label="Точка события" value={event.pointId??''} options={points} onChange={pointId=>configure({event:{...event,pointId}})}/ >}{!document.logic.edges.some(e=>e.target===node.id&&e.targetHandle==='zone')&&<Choice label="Область события" value={event.zoneId??''} options={circles} onChange={zoneId=>configure({event:{...event,zoneId}})}/>}</>}
      <Choice label="Контекст события" value={event.contextEntityId??''} options={document.entities.filter(entity=>!entity.folder)} onChange={contextEntityId=>configure({event:{...event,contextEntityId}})}/>
      {event.trigger==='condition'&&<><Choice label="Параметр возникновения" value={event.parameterId??''} options={document.parameters.map(p=>({...p,name:`${document.entities.find(e=>e.id===p.ownerId)?.name} / ${p.name}`}))} onChange={parameterId=>configure({event:{...event,parameterId,threshold:event.threshold??0,comparison:event.comparison??'gte'}})}/><label className="field">Сравнение<select value={event.comparison??'gte'} onChange={e=>configure({event:{...event,comparison:e.target.value as EventDefinition['comparison']}})}><option value="gt">Больше</option><option value="gte">Не меньше</option><option value="lte">Не больше</option><option value="eq">Равно</option></select></label><NumericField label="Порог события" value={event.threshold??0} onChange={threshold=>configure({event:{...event,threshold}})}/></>}
      {event.contextEntityId&&<small>Данные: {document.parameters.filter(p=>p.ownerId===event.contextEntityId).map(p=>p.name).join(', ')||'Нет параметров'}</small>}
      {event.contextEntityId&&<button onClick={()=>onCommand({type:'context.create',id:crypto.randomUUID(),entityIds:[event.contextEntityId!],position:{x:node.position.x,y:node.position.y+320}})}>Добавить текущий контекст на схему</button>}
      </fieldset>{event.trigger==='manual' && <button disabled={!checking} onClick={()=>onCommand({type:'behavior.fire',nodeId:node.id})}>Вызвать событие</button>}
      <fieldset disabled={checking} className="event-settings-fields"><div className="event-reactions"><strong>Реакции по порядку</strong>{document.logic.edges.filter(edge=>edge.source===node.id&&edge.sourceHandle==='then'&&edge.targetHandle==='exec').map((edge,index,edges)=><div key={edge.id}><span>{index+1}. {document.logic.nodes.find(n=>n.id===edge.target)?.data.label}</span><button disabled={index===0} aria-label="Поднять реакцию" onClick={()=>{const reordered=[...document.logic.edges];const a=reordered.indexOf(edge),b=reordered.indexOf(edges[index-1]);[reordered[a],reordered[b]]=[reordered[b],reordered[a]];onCommand({type:'logic.replace',logic:{...document.logic,edges:reordered}});}}>↑</button></div>)}</div>
      </fieldset><div className="dialog-actions"><button className="primary" onClick={()=>setEventSettings(false)}>Готово</button></div></dialog>,window.document.body)}</>}
    {node.data.role==='action'  && <>
      <label className="field">Операция действия<select value={action.operation} onChange={e=>configure({action:{...action,operation:e.target.value as ActionDefinition['operation'],targetId:'',duration:action.duration??1}})}>
        <option value="emit">Вызвать событие</option><option value="set">Установить параметр</option><option value="add">Прибавить к параметру</option><option value="rate">Изменять в секунду</option><option value="move">Задать положение точки</option><option value="translate">Сместить точку</option><option value="path">Двигаться по пути</option>
      </select></label>
      {action.operation!=='emit'&&<Choice label="Получатель действия" value={action.targetId} options={['set','add','rate'].includes(action.operation)?document.parameters.map(parameter=>({id:parameter.id,name:`${parameter.name} · ${document.entities.find(entity=>entity.id===parameter.ownerId)?.name??'Без участника'}`})):points.map(point=>({id:point.id,name:`${point.name} · Точка`}))} onChange={targetId=>configure({action:{...action,targetId}})}/>}
      {action.operation==='rate' && <label className="field">Длительность эффекта, тиков<input type="number" min="1" max="10000" step="1" value={action.duration??1} onChange={e=>configure({action:{...action,duration:Number(e.target.value)}})}/><small>Значение указано за секунду; длительность использует размер тика таймлайна.</small></label>}
      {action.operation==='emit'?<Choice label="Вызываемое событие" value={action.targetId} options={document.logic.nodes.filter(n=>n.data.role==='event').map(n=>({id:n.id,name:n.data.label}))} onChange={targetId=>configure({action:{...action,targetId}})}/>:action.operation==='path'?<><Choice label="Путь действия" value={action.pathId??''} options={document.paths} onChange={pathId=>configure({action:{...action,pathId}})}/><small>В проигрывании — движение по длительности пути; ручной вызов применяет конец.</small></>:<BehaviorValueEditor node={node} document={document} onCommand={onCommand}/>}
    </>}
    {node.data.role==='condition'&&<BehaviorValueEditor node={node} document={document} onCommand={onCommand}/>}
    {node.data.role==='repeat'&&<CalculationEditor node={node} document={document} onCommand={onCommand}/>}
    {node.data.role==='spatial' && <>
      <details><summary>Изменить вид проверки</summary><label className="field">Пространственная операция<select value={spatial.operation} onChange={e=>configure({spatial:{...spatial,operation:e.target.value as SpatialDefinition['operation']}})}>
        {Object.entries(spatialLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label></details>
      {!document.logic.edges.some(e=>e.target===node.id&&e.targetHandle==='origin') && <Choice label="Начало" value={spatial.originId} options={document.shapes} onChange={originId=>configure({spatial:{...spatial,originId}})}/>}
      {!['position','nearest','trace'].includes(spatial.operation) && !document.logic.edges.some(e=>e.target===node.id&&e.targetHandle==='target') && <Choice label="Цель" value={spatial.targetId??''} options={spatial.operation==='inside'?document.shapes.filter(s=>['circle','rectangle','polygon','chart'].includes(s.kind)):document.shapes} onChange={targetId=>configure({spatial:{...spatial,targetId}})}/>}
      {['nearest','raycast','trace'].includes(spatial.operation) && <Choice label="Проверяемая группа" value={spatial.groupId??''} options={document.sceneGroups} onChange={groupId=>configure({spatial:{...spatial,groupId}})}/>}
      {document.shapes.find(s=>s.id===spatial.originId)?.anchors?.length?<AnchorChoice label="Точка начала" shape={document.shapes.find(s=>s.id===spatial.originId)} value={spatial.originAnchor} onChange={originAnchor=>configure({spatial:{...spatial,originAnchor}})}/>:null}
      {!['position','nearest','inside','trace'].includes(spatial.operation)&&Boolean(document.shapes.find(s=>s.id===spatial.targetId)?.anchors?.length)&&<AnchorChoice label="Точка цели" shape={document.shapes.find(s=>s.id===spatial.targetId)} value={spatial.targetAnchor} onChange={targetAnchor=>configure({spatial:{...spatial,targetAnchor}})}/>}
      {spatial.operation==='trace'&&<>
        <SpatialRangeField label="Направление" unit="°" value={spatial.angle??0} minimum={0} maximum={360} step={0.5} marks={[0,30,45,90,135,180,225,270,315,360]} ariaLabel="Направление луча" onChange={angle=>configure({spatial:{...spatial,angle}})}/>
        <SpatialRangeField label="Дальность" unit="" value={spatial.range??1000} minimum={1} maximum={2000} exactMaximum={1_000_000_000} step={1} marks={[100,250,500,750,1000,1500,2000]} ariaLabel="Дальность луча" onChange={range=>configure({spatial:{...spatial,range}})}/>
        <label className="field">Остановка<select value={spatial.stopMode??'first'} onChange={e=>configure({spatial:{...spatial,stopMode:e.target.value as SpatialDefinition['stopMode']}})}><option value="first">Первое столкновение</option><option value="object">На выбранном объекте</option><option value="group">На объекте выбранной группы</option></select></label>
        {spatial.stopMode==='object'&&<Choice label="Объект остановки" value={spatial.stopId??''} options={document.shapes} onChange={stopId=>configure({spatial:{...spatial,stopId}})}/>}
        {spatial.stopMode==='group'&&<Choice label="Группа остановки" value={spatial.stopGroupId??''} options={document.sceneGroups} onChange={stopGroupId=>configure({spatial:{...spatial,stopGroupId}})}/>}
      </>}
      {['raycast','trace'].includes(spatial.operation)&&<><details><summary>Результат проверки</summary><label className="field">Что получить<select value={spatial.output??'blocked'} onChange={e=>configure({spatial:{...spatial,output:e.target.value as SpatialDefinition['output']}})}><option value="blocked">Есть ли попадание</option><option value="count">Количество объектов на пути</option><option value="distance">Расстояние до последнего объекта</option><option value="point">Координаты последнего попадания</option></select></label></details>{(()=>{try{const trace=spatialTrace(document,spatial,id=>{const r=readParameterValue(document,id);if(r.status==='error')throw Error(r.message);return r.value;});return <div className="trace-results" aria-label="Результат проверки лучом">{trace.hits.length===0?<p>{spatial.operation==='trace'?'На пути до конца луча объектов нет.':'На выбранном отрезке объектов нет.'}</p>:<><small>{spatial.operation==='trace'?(trace.stopped?'Луч остановился на объекте:':'Луч встретил на пути:'):'Объекты на пути:'}</small>{trace.hits.map((h,index)=>{const shape=document.shapes.find(s=>s.id===h.shapeId);if(!shape)return null;const stoppedHere=trace.stopped&&index===trace.hits.length-1;return <button className="trace-hit" key={h.shapeId} type="button" title={`Показать «${shape.name}» на холсте`} aria-label={`Показать ${shape.name} на холсте`} onClick={event=>{event.stopPropagation();onSelectShape?.(shape.id);}}><span>{shape.name}</span>{stoppedHere&&<small>Здесь луч остановился</small>}</button>;})}</>}{spatial.operation==='trace'&&!trace.stopped&&trace.hits.length>0&&<small>Луч прошёл все эти объекты и достиг конца.</small>}</div>;}catch{return null;}})()}</>}
    </>}
    {result?.status==='ready' && !(node.data.role==='action'&&['path','emit'].includes(action.operation)) && !simpleActionValue && <output aria-label="Результат блока">{node.data.role==='spatial'&&spatial.output!=='count'&&spatial.output!=='distance'&&spatial.output!=='point'?(result.value?'Есть попадание':'Ничего не найдено'):JSON.stringify(result.value)}</output>}
    {result?.status==='error' && !(node.data.role==='action'&&['path','emit'].includes(action.operation)) && <p role="alert" className="binding-error">{result.message}</p>}
    {execution && <p role={execution.status==='error'?'alert':'status'} className={execution.status==='error'?'binding-error':'quiet'}>{execution.message}</p>}
  </div>;
}
export function GroupPortEditor({node,document,onCommand}:{node:LogicNode;document:WorkspaceDocument;onCommand:(command:WorkspaceCommand)=>void}) {
  const ports=groupPorts(document.logic,node.id,true,document.parameters,document.shapes), all=[...ports.inputs,...ports.outputs], selected=node.data.exposedPorts??all.map(p=>p.id);
  return <details className="nodrag nopan nowheel"><summary>Порты</summary>{all.map(port=><label className="group-member" key={port.id}><input type="checkbox" checked={selected.includes(port.id)} onChange={e=>onCommand({type:'group.ports',nodeId:node.id,portIds:e.target.checked?[...selected,port.id]:selected.filter(id=>id!==port.id)})}/>{ports.inputs.includes(port)?'Вход: ':'Выход: '}{port.label}</label>)}</details>;
}

function AnchorChoice({label,shape,value,onChange}:{label:string;shape?:import('../workspace/document.ts').SceneShape;value?:string;onChange:(id:string)=>void}) {return <label className="field">{label}<select value={value??''} onChange={e=>onChange(e.target.value)}><option value="">Опорная точка объекта</option>{value&&!shape?.anchors?.some(a=>a.id===value)&&<option value={value}>Точка удалена</option>}{shape?.anchors?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>;}

function SpatialRangeField({label,unit,value,minimum,maximum,exactMaximum=maximum,step,marks,ariaLabel,onChange}:{label:string;unit:string;value:number;minimum:number;maximum:number;exactMaximum?:number;step:number;marks:number[];ariaLabel:string;onChange:(value:number)=>void}) {
 const listId=`spatial-${ariaLabel.replace(/[^a-z0-9]/gi,'-')}-marks`;
 const sliderMaximum=Math.max(maximum,Math.ceil(value/maximum)*maximum);
 return <div className="spatial-range-field"><label className="field"><span className="spatial-range-heading">{label}<output>{Number(value.toFixed(1))}{unit}</output></span><input aria-label={ariaLabel} type="range" min={minimum} max={sliderMaximum} step={step} value={value} list={listId} onChange={e=>onChange(Number(e.target.value))}/><datalist id={listId}>{marks.map(mark=><option key={mark} value={mark} label={`${mark}${unit}`}/>)}</datalist></label><div className="spatial-precise"><NumericField label="Точное значение" value={value} minimum={minimum} maximum={exactMaximum} onChange={onChange}/></div></div>;
}
