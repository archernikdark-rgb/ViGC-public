import { createPortal } from 'react-dom';
import { InlineName } from './EntityTreeEditor.tsx';
import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { markerColors, nextSnapshotName } from '../engine/playback.ts';
import type { Playback, PlaybackCommand, MarkerColor } from '../engine/playback.ts';
import type { WorkspaceDocument } from '../workspace/document.ts';
import { Icon, IconButton } from './Icon.tsx';
import { NumericField } from './NumericField.tsx';

export function Timeline({playback:p,document,disabled,onCommand}:{playback:Playback;document:WorkspaceDocument;disabled:boolean;onCommand:(command:PlaybackCommand)=>void}) {
 const [color,setColor]=useState<MarkerColor>('green'),[zoom,setZoom]=useState(1),[selection,setSelection]=useState<{kind:'snapshot'|'marker';id:string}|null>(null);
 const snapshot=selection?.kind==='snapshot'?p.snapshots.find(v=>v.id===selection.id):undefined;
 const marker=selection?.kind==='marker'?p.markers.find(v=>v.id===selection.id):undefined;
 const [anchor,setAnchor]=useState<{x:number;y:number}|null>(null);
 const dragStart=useRef<{id:string;x:number}|null>(null);
 const usesTime=document.logic.nodes.some(node=>node.data.action?.operation==='rate');
 const rulerTicks=[...new Set(Array.from({length:Math.min(10,p.duration)+1},(_,i)=>Math.round(p.duration*i/Math.min(10,p.duration))))];
 const percent=(time:number)=>`${time/p.duration*100}%`;
 const tick=(value:number)=>Math.max(0,Math.min(p.duration,Math.round(value)));
 function seek(e:PointerEvent<HTMLDivElement>){const bounds=e.currentTarget.getBoundingClientRect();onCommand({type:'playback.seek',time:tick((e.clientX-bounds.left)/bounds.width*p.duration)});}
 function dragTime(e:PointerEvent<HTMLButtonElement>){const bounds=e.currentTarget.closest('.timeline-tracks')!.getBoundingClientRect();return tick((e.clientX-bounds.left)/bounds.width*p.duration);}
 const bandLabel=(effect:{targetId:string;rate:number;start:number;duration:number})=>{
  const parameter=document.parameters.find(v=>v.id===effect.targetId);
  const quantity=parameter?.name??'Параметр';
  const sign=effect.rate<0?'−':'+', amount=Math.abs(effect.rate);
  return `${sign}${amount} ${quantity}/с · ${effect.start}–${effect.start+effect.duration} т`;
 };
 return <div className="timeline">
 <div className="playback-controls">
  <IconButton icon={p.status==='playing'?'pause':'play'} primary label={p.status==='playing'?'Пауза':'Пуск'} disabled={disabled} onClick={()=>onCommand({type:p.status==='playing'?'playback.pause':'playback.play'})}/>
  <IconButton icon='restart' label='Сначала' disabled={disabled} onClick={()=>onCommand({type:'playback.restart'})}/>
  <button className="icon-button" aria-label={p.looping?'Отключить повтор':'Включить повтор'} title={p.looping?'Отключить повтор':'Включить повтор'} aria-pressed={p.looping} onClick={()=>onCommand({type:'playback.loop',enabled:!p.looping})}><Icon name="loop"/></button>
  {p.debugging?<output aria-label="Текущий тик">Тик {p.time.toFixed(2)} / {p.duration}</output>:<details className="timeline-duration"><summary title="Изменить длительность симуляции">Тик {p.time.toFixed(2)} / {p.duration}</summary><NumericField label="Длительность, тики" value={p.duration} minimum={1} maximum={10000} integer onChange={duration=>onCommand({type:'playback.duration',duration})}/></details>}
  {usesTime&&(p.debugging?<output title="Настройка меняется в режиме редактирования">1 тик = {p.tickSeconds} с</output>:<details className="timeline-duration tick-size"><summary title="Соответствие тика времени">1 тик = {p.tickSeconds} с</summary><NumericField label="Реальное время за тик, с" value={p.tickSeconds} minimum={0.001} maximum={300} onChange={seconds=>onCommand({type:'playback.tick-size',seconds})}/></details>)}
  <IconButton icon='snapshot' label='Сохранить ключ' disabled={disabled||p.status==='playing'||p.status==='error'} onClick={()=>{const id=crypto.randomUUID();onCommand({type:'snapshot.add',id,name:nextSnapshotName(p.snapshots)});setSelection(null);setAnchor(null);}}/>
  <IconButton icon='marker' label='Добавить маркер' disabled={disabled} onClick={()=>{const id=crypto.randomUUID();onCommand({type:'marker.add',id,name:`Маркер ${p.markers.length+1}`,time:tick(p.time),color});setSelection(null);setAnchor(null);}}/>
  {(Object.keys(markerColors) as MarkerColor[]).map(c=><button key={c} className="marker-swatch" aria-label={`Цвет маркера: ${{green:'зелёный',red:'красный',blue:'синий',yellow:'жёлтый'}[c]}`} aria-pressed={(marker?.color ?? color)===c} style={{background:markerColors[c]}} onClick={()=>{if(marker)onCommand({type:'marker.update',id:marker.id,update:{color:c}});else setColor(c);}}/>)}
  <span className="header-spacer"/><button aria-label="Уменьшить масштаб времени" onClick={()=>setZoom(Math.max(1,zoom/2))}>−</button><button aria-label="Увеличить масштаб времени" onClick={()=>setZoom(Math.min(8,zoom*2))}>+</button>
 </div>
 <div className="timeline-scroll"><div className="timeline-grid" style={{width:`${zoom*100}%`}}>
  <div className="timeline-labels"><span>Шкала</span><span>Эффекты</span><span>Ключи</span><span>Маркеры</span></div>
  <div className="timeline-tracks">
   <div className="timeline-ruler" role="slider" tabIndex={0} aria-label="Текущий тик" aria-valuemin={0} aria-valuemax={p.duration} aria-valuenow={p.time} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onCommand({type:'playback.seek',time:tick(p.time+(e.key==='ArrowLeft'?-1:1))});}}} onPointerDown={e=>{if(!disabled){e.currentTarget.setPointerCapture(e.pointerId);seek(e);}}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))seek(e);}}>
    {rulerTicks.map(value=><span key={value} style={{left:percent(value)}}>{value} т</span>)}
   </div>
   <div className="effect-track" aria-label="Активные диапазоны эффектов">
    {p.effects.map((effect,index)=>{const left=effect.start/p.duration*100,width=Math.max(0,Math.min(100-left,effect.duration/p.duration*100));return <div key={`${effect.targetId}-${effect.start}-${index}`} className="effect-band" style={{left:`${left}%`,width:`${width}%`}} title={bandLabel(effect)} aria-label={bandLabel(effect)}><span>{bandLabel(effect)}</span></div>;})}
   </div>
   <div className="snapshot-track">{p.snapshots.map(s=><button key={s.id} className="timeline-key" style={{left:percent(s.time)}} aria-label={`Ключ ${s.name}, тик ${s.time}`} aria-pressed={snapshot?.id===s.id} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onCommand({type:'snapshot.time',id:s.id,time:tick(s.time+(e.key==='ArrowLeft'?-1:1))});}}} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setAnchor({x:r.left,y:r.top});setSelection({kind:'snapshot',id:s.id});}} onPointerDown={e=>{dragStart.current={id:s.id,x:e.clientX};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerCancel={()=>{dragStart.current=null;}} onPointerUp={e=>{const start=dragStart.current;dragStart.current=null;if(!start||start.id!==s.id||Math.abs(start.x-e.clientX)<4||!e.currentTarget.hasPointerCapture(e.pointerId))return;onCommand({type:'snapshot.time',id:s.id,time:dragTime(e)});}}><span>◆</span><small>{s.name}</small></button>)}</div>
   <div className="marker-track">{p.markers.map(m=><button key={m.id} className="timeline-marker" style={{left:percent(m.time),color:markerColors[m.color]}} aria-label={`Маркер ${m.name}, тик ${m.time}`} aria-pressed={marker?.id===m.id} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onCommand({type:'marker.update',id:m.id,update:{time:tick(m.time+(e.key==='ArrowLeft'?-1:1))}});}}} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setAnchor({x:r.left,y:r.top});setSelection({kind:'marker',id:m.id});}} onPointerDown={e=>{dragStart.current={id:m.id,x:e.clientX};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerCancel={()=>{dragStart.current=null;}} onPointerUp={e=>{const start=dragStart.current;dragStart.current=null;if(!start||start.id!==m.id||Math.abs(start.x-e.clientX)<4||!e.currentTarget.hasPointerCapture(e.pointerId))return;onCommand({type:'marker.update',id:m.id,update:{time:dragTime(e)}});}}><span>▲</span><small>{m.name}</small></button>)}</div>
   <div className="timeline-playhead" style={{left:percent(p.time)}}><span>▼</span></div>
  </div>
 </div></div>
 {p.error&&<p role="alert" className="binding-error">{p.error}</p>}
 {anchor&&(snapshot||marker)&&createPortal(<div className="timeline-popover" role="group" aria-label={snapshot?'Ключ':'Маркер'} style={{left:Math.max(8,Math.min(anchor.x,window.innerWidth-230)),top:anchor.y+75<window.innerHeight?anchor.y+34:Math.max(8,anchor.y-58)}} onKeyDown={e=>{if(e.key==='Escape'){setSelection(null);setAnchor(null);}}}>
  <InlineName value={(snapshot??marker)!.name} label={snapshot?'Имя ключа':'Имя маркера'} onChange={name=>snapshot?onCommand({type:'snapshot.rename',id:snapshot.id,name}):marker&&onCommand({type:'marker.update',id:marker.id,update:{name}})}/>
  <output>Тик {(snapshot??marker)!.time}</output>
  <IconButton icon="trash" label={snapshot?'Удалить ключ':'Удалить маркер'} onClick={()=>{if(snapshot)onCommand({type:'snapshot.remove',id:snapshot.id});if(marker)onCommand({type:'marker.remove',id:marker.id});setSelection(null);setAnchor(null);}}/>
  <button className="timeline-popover-close" aria-label="Закрыть" onClick={()=>{setSelection(null);setAnchor(null);}}>×</button>
 </div>,globalThis.document.body)}
 </div>;
}
