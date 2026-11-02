import { useState } from 'react';
import { NumericField } from './NumericField.tsx';
import type { WorkspaceDocument, WorkspaceCommand, SceneShape } from '../workspace/document.ts';
export function SceneBehaviorTools({document,selected,onCommand}:{document:WorkspaceDocument;selected?:SceneShape;onCommand:(command:WorkspaceCommand)=>void}) {
  const [pointId,setPointId]=useState(''),[zoneId,setZoneId]=useState(''),[name,setName]=useState('Путь'),[duration,setDuration]=useState(1);
  const point=selected?.kind==='point'?selected.id:pointId, zone=selected?.kind==='circle'?selected.id:zoneId;
  return <section className="scene-behavior">
    {document.recording ? <div role="region" aria-label="Запись пути"><strong>Идёт запись: {document.shapes.find(s=>s.id===document.recording?.pointId)?.name}</strong>
      <p className="quiet">Перемещайте выбранную точку. Escape отменяет запись и возвращает исходное положение.</p>
      <label className="field">Название пути<input value={name} onChange={e=>setName(e.target.value)}/></label>
      <NumericField label="Длительность пути, тиков" value={duration} minimum={1} maximum={10000} integer onChange={setDuration}/>
      <button onClick={()=>onCommand({type:'path.finish',id:crypto.randomUUID(),name,duration})}>Завершить запись</button>
      <button onClick={()=>onCommand({type:'path.cancel'})}>Отменить запись</button>
    </div>:<>
      {selected?.kind==='point' && <button onClick={()=>onCommand({type:'path.begin',pointId:selected.id})}>Записать путь точки</button>}
      {(selected?.kind==='point'||selected?.kind==='circle') && <details><summary>Событие из контекста холста</summary>
        <label className="field">Точка для события<select value={point} onChange={e=>setPointId(e.target.value)} disabled={selected.kind==='point'}><option value="">Выберите точку</option>{document.shapes.filter(s=>s.kind==='point').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field">Область для события<select value={zone} onChange={e=>setZoneId(e.target.value)} disabled={selected.kind==='circle'}><option value="">Выберите область</option>{document.shapes.filter(s=>s.kind==='circle').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <button disabled={!point||!zone} onClick={()=>onCommand({type:'logic.replace',logic:{...document.logic,nodes:[...document.logic.nodes,{id:crypto.randomUUID(),type:'draft',position:{x:document.logic.nodes.filter(n=>!n.parentId).reduce((right,n)=>Math.max(right,n.position.x+350),60),y:50},data:{role:'event',label:'Вход в область',event:{trigger:'enter',pointId:point,zoneId:zone}}}]}})}>Создать событие входа</button>
      </details>}
    </>}
    <details><summary>Пути</summary>{document.paths.map(path=><div className="entity-group" key={path.id}><strong>{path.name}</strong>
      <NumericField label={`Длительность: ${path.name}, тиков`} value={path.duration} minimum={1} maximum={10000} integer onChange={duration=>onCommand({type:'path.duration',id:path.id,duration})}/>
      <button onClick={()=>onCommand({type:'path.remove',id:path.id})}>Удалить путь: {path.name}</button>
    </div>)}</details>
  </section>;
}
