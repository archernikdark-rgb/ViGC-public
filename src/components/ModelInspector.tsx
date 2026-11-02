import { TextField } from './TextField.tsx';
import { useEffect, useState } from 'react';
import { readParameterValue } from '../engine/calculations.ts';
import { NumericField } from './NumericField.tsx';
import { Icon, IconButton } from './Icon.tsx';
import type { ParameterControls, WorkspaceCommand, WorkspaceDocument } from '../workspace/document.ts';

function EntityName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState('');
  useEffect(() => setDraft(name), [name]);
  return <label className="field">Имя участника<input value={draft} aria-invalid={Boolean(error)} onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      const nextName = draft.trim();
      if (!nextName) {
        setDraft(name);
        setError('Введите непустое имя. Возвращено прежнее имя участника.');
        return;
      }
      setError('');
      setDraft(nextName);
      if (nextName !== name) onRename(nextName);
    }}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />{error && <small role="alert">{error}</small>}</label>;
}

export function ModelInspector({ document, onCommand, entityId, onLink }: {
  document: WorkspaceDocument; onCommand: (command: WorkspaceCommand) => void; entityId?: string; onLink?: (kind:'entity'|'parameter',id:string)=>void;
}) {
  return <div className="model-data">{!entityId && <div className="section-heading"><h2>Модель</h2>
    <IconButton icon="plus" label="Добавить участника" onClick={() => onCommand({ type: 'entity.add', entity: { id: crypto.randomUUID(), name: `Участник ${document.entities.length + 1}` } })} />
  </div>}
    {!document.entities.length && <p className="quiet">Добавьте участника, затем его числовые параметры.</p>}
    {document.entities.filter(entity => !entityId || entity.id === entityId).map(entity => <details className="entity-group" key={entity.id} open={entityId ? true : undefined}><summary draggable onDragStart={event=>{event.dataTransfer.setData('application/x-vigc-item',JSON.stringify({kind:'entity',id:entity.id}));}}>{entity.name}</summary>
      <div className="section-heading">
        <IconButton icon="plus" disabled={entity.folder} label={`Добавить параметр: ${entity.name}`} onClick={() => onCommand({
          type: 'parameter.add', parameter: { id: crypto.randomUUID(), ownerId: entity.id, name: `Параметр ${document.parameters.filter(parameter => parameter.ownerId === entity.id).length + 1}`, value: 0 },
        })} />
      </div>
      <div className="name-with-visibility"><EntityName name={entity.name} onRename={name => onCommand({ type: 'entity.rename', id: entity.id, name })} />{!entity.folder&&<button className="icon-button" aria-label="Показывать имя участника" title="Показывать имя участника" aria-pressed={entity.labelVisible!==false} onClick={()=>onCommand({type:'entity.visibility',id:entity.id,visible:entity.labelVisible===false})}><Icon name={entity.labelVisible===false?'eyeOff':'eye'}/></button>}</div>
      <div className="entity-links">{onLink&&!entity.folder&&<IconButton icon="link" label="Связать участника с объектом" onClick={()=>onLink('entity',entity.id)}/>} {document.shapes.filter(s=>s.entityId===entity.id).map(s=><span className="linked-chip" key={s.id}>{s.name}</span>)}</div>
      {document.parameters.filter(parameter => parameter.ownerId === entity.id).map(parameter => <div className="parameter-record" key={parameter.id} draggable onDragStart={event=>{event.dataTransfer.setData('application/x-vigc-item',JSON.stringify({kind:'parameter',id:parameter.id}));event.dataTransfer.effectAllowed='copy';}}>
        <TextField label={`Имя параметра: ${parameter.name}`} value={parameter.name} onChange={name=>onCommand({type:'parameter.update',id:parameter.id,update:{name}})}/>
        <label className="field">Источник значения (=)<select value={parameter.sourceNodeId ?? ''} onChange={event => onCommand({ type: 'parameter.assign', id: parameter.id, sourceNodeId: event.target.value || null })}>
          <option value="">Ручное значение</option>
          {parameter.sourceNodeId && !document.logic.nodes.some(node => node.id === parameter.sourceNodeId) && <option value={parameter.sourceNodeId} disabled>Блок удалён — выберите замену</option>}
          {document.logic.nodes.filter(node => node.data.role === 'calculate' || node.data.role === 'variable').map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}
        </select></label>
        {!parameter.sourceNodeId ? <NumericField label={`Значение: ${parameter.name}`} value={parameter.value} minimum={parameter.controls?.min} maximum={parameter.controls?.max}
          onChange={value => onCommand({ type: 'parameter.update', id: parameter.id, update: { value } })} />
          : <ParameterResult document={document} id={parameter.id} /> }
        <ParameterControlsEditor name={parameter.name} value={parameterControlValue(document, parameter.id, parameter.value)} controls={parameter.controls ?? {}} editable={!parameter.sourceNodeId} onControls={controls => onCommand({type:'parameter.controls', id:parameter.id, controls})} onValue={value => onCommand({type:'parameter.update', id:parameter.id, update:{value}})} />
        {onLink&&<IconButton icon="link" label={`Связать параметр: ${parameter.name}`} onClick={()=>onLink('parameter',parameter.id)}/>}
        <IconButton icon="trash" label={`Удалить параметр: ${parameter.name}`} onClick={() => onCommand({ type: 'parameter.remove', id: parameter.id })} />
      </div>)}
    </details>)}
  </div>;
}

function ParameterResult({ document, id }: { document: WorkspaceDocument; id: string }) {
  const result = readParameterValue(document, id);
  return result.status === 'ready' ? <output aria-label="Вычисляемое значение">{String(result.value)}</output> : <p role="alert" className="binding-error">{result.message}</p>;
}

function ParameterControlsEditor({name,value,controls,editable,onControls,onValue}:{name:string;value:number;controls:ParameterControls;editable:boolean;onControls:(controls:ParameterControls)=>void;onValue:(value:number)=>void}) {
 const [draft,setDraft]=useState({min:'',max:'',step:''});
 const [error,setError]=useState('');
 useEffect(()=>setDraft({min:controls.min?.toString()??'',max:controls.max?.toString()??'',step:controls.step?.toString()??''}),[controls.min,controls.max,controls.step]);
 function commit(key:'min'|'max'|'step') {
  const raw=draft[key].trim(); const n=raw?Number(raw.replace(',','.')):undefined;
  const next={...controls,[key]:n};
  if ((n!==undefined&&!Number.isFinite(n))||(key==='step'&&n!==undefined&&n<=0)||(next.min!==undefined&&next.max!==undefined&&next.min>next.max)) {
   setDraft(d=>({...d,[key]:controls[key]?.toString()??''})); setError('Введите конечные границы: минимум не больше максимума, шаг больше нуля.'); return;
  }
  setError(''); if(n!==controls[key]) onControls(next);
 }
 const invalid=(controls.min!==undefined&&value<controls.min)||(controls.max!==undefined&&value>controls.max);
 const step=controls.step??1;
 function move(direction:number) { const next=value+direction*step; if(Number.isFinite(next)&&(controls.min===undefined||next>=controls.min)&&(controls.max===undefined||next<=controls.max))onValue(next); }
 return <div className="parameter-controls"><details><summary>Границы и шаг</summary>
  {(['min','max','step'] as const).map(key=><label className="field" key={key}>{{min:'Минимум',max:'Максимум',step:'Шаг'}[key]}<input aria-label={`${{min:'Минимум',max:'Максимум',step:'Шаг'}[key]}: ${name}`} inputMode="decimal" placeholder={key==='step'?'1':'Без ограничения'} value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))} onBlur={()=>commit(key)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} /></label>)}
  </details>{error&&<small role="alert">{error}</small>}
  {invalid&&<small role="alert">Значение вне заданных границ; исправьте значение или границы.</small>}
  {editable&&<div><button type="button" aria-label={`Уменьшить: ${name}`} disabled={invalid||(controls.min!==undefined&&value-step<controls.min)} onClick={()=>move(-1)}>−</button> <button type="button" aria-label={`Увеличить: ${name}`} disabled={invalid||(controls.max!==undefined&&value+step>controls.max)} onClick={()=>move(1)}>+</button></div>}
 </div>;
}

function parameterControlValue(document: WorkspaceDocument, id: string, fallback: number): number {
 const result = readParameterValue(document, id);
 return result.status === 'ready' && typeof result.value === 'number' ? result.value : fallback;
}
