import { useEffect, useRef, useState } from 'react';
import type { CalculationDefinition } from '../engine/calculations.ts';
import type { LogicNode, WorkspaceCommand, WorkspaceDocument } from '../workspace/document.ts';

const emptyCalculation: CalculationDefinition = { expression: '', inputs: [] };
function sourceLabel(document:WorkspaceDocument,node:LogicNode,inputId:string){
  const edge=document.logic.edges.find(edge=>edge.target===node.id&&edge.targetHandle===inputId);
  if(!edge)return 'Источник не подключён';
  const source=document.logic.nodes.find(candidate=>candidate.id===edge.source);
  if(edge.sourceHandle?.startsWith('parameter:')){
    const parameterId=edge.sourceHandle.slice('parameter:'.length),parameter=document.parameters.find(value=>value.id===parameterId);
    const owner=document.entities.find(value=>value.id===parameter?.ownerId);
    return parameter?`${source?.data.role==='event'?source.data.label+' / данные события / ':''}${owner?.name??'Сущность'} / ${parameter.name}`:`${source?.data.label??'Контекст'} / источник удалён`;
  }
  return source?.data.label??'Источник удалён';
}

export function CalculationEditor({ node, document, onCommand }: {
  node: LogicNode; document:WorkspaceDocument; onCommand: (command: WorkspaceCommand) => void;
}) {
  const saved = node.data.calculation ?? emptyCalculation;
  const [draft, setDraft] = useState(saved);
  const [showHelp, setShowHelp] = useState(false);
  const expressionRef=useRef<HTMLInputElement>(null);
  const savedSignature = JSON.stringify(saved);
  // Worker snapshots replace references even when the persisted expression is unchanged.
  useEffect(() => setDraft(saved), [savedSignature]);
  function insert(alias:string){
    const input=expressionRef.current,start=input?.selectionStart??draft.expression.length,end=input?.selectionEnd??draft.expression.length;
    const expression=`${draft.expression.slice(0,start)}${alias}${draft.expression.slice(end)}`;setDraft({...draft,expression});
    requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(start+alias.length,start+alias.length);});
  }
  function renameInput(index:number,alias:string){
    const previous=draft.inputs[index]?.alias;if(!previous)return;
    const escaped=previous.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const expression=draft.expression.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,'gu'),alias);
    setDraft({...draft,expression,inputs:draft.inputs.map((item,itemIndex)=>itemIndex===index?{...item,alias}:item)});
  }
  return <form className="calculation-editor nodrag nopan nowheel" onSubmit={event => { event.preventDefault(); onCommand({ type: 'calculation.update', nodeId: node.id, calculation: draft }); }}>
    <label className="field">Формула<input ref={expressionRef} value={draft.expression} placeholder="например: урон - броня" onChange={event => setDraft({ ...draft, expression: event.target.value })} /></label>
    <section className="calculation-inputs" aria-label="Входы формулы"><div className="calculation-input-heading"><strong>Входы формулы</strong><span>{draft.inputs.length}</span></div>{draft.inputs.length===0&&<small>Константа не использует входы.</small>}{draft.inputs.map((input, index) => <div className="calculation-input" key={input.id}>
      <label className="field"><span>Источник {index+1} · имя в формуле</span><input aria-label={`Имя входа ${index+1}`} value={input.alias} onChange={event => renameInput(index,event.target.value)} /><small className="calculation-source">Подключено: {sourceLabel(document,node,input.id)}</small></label>
      <button type="button" className="calculation-insert-input" onClick={()=>insert(input.alias)} title={`Вставить ${input.alias} в формулу`}>Вставить</button>
      <button type="button" className="calculation-remove-input" aria-label={`Удалить вход ${input.alias}`} onClick={() => setDraft({ ...draft, inputs: draft.inputs.filter((_, itemIndex) => itemIndex !== index) })}>Удалить</button>
    </div>)}
    <button type="button" className="calculation-add-input" onClick={() => {
      let index = 1;
      while (draft.inputs.some(input => input.alias === `значение_${index}`)) index++;
      setDraft({ ...draft, inputs: [...draft.inputs, { id: crypto.randomUUID(), alias: `значение_${index}` }] });
    }}>+ Добавить вход</button></section><div className="calculation-actions"><button type="submit">Сохранить формулу</button><button type="button" className="calculation-help-toggle" aria-expanded={showHelp} onClick={()=>setShowHelp(value=>!value)}>{showHelp?'Скрыть справку':'Справка по формулам'}</button></div>
    {showHelp&&<div className="calculation-help"><small>
      abs, sqrt, sin, cos, atan2 (углы в радианах).<br />
      vec(x,y), x(v), y(v), length(v), normalize(v), scale(v,k), vadd(a,b), vsub(a,b), dot(a,b).<br />
      mean(1, 2, 3) — среднее; median([1, 4, 2]) — медиана; mode(1, 1, 2) — список мод.<br />
      min, max, sum — выборка или несколько чисел.<br />
      arithmetic(первый, шаг, количество); geometric(первый, множитель, количество).<br />
      урон^2; if(урон &gt; 0, урон, 0); сравнения &lt;, &gt;, &lt;=, &gt;=, ==, !=; &amp;&amp;, ||, !.<br />
      Дробь через точку, аргументы через запятую. Входы соединяются проводами; источник и его имя показаны в списке. Кнопка «Вставить» добавляет имя выбранного входа в формулу. Мода при равной частоте возвращает все такие значения.
    </small></div>}
  </form>;
}

export function AssignmentPicker({ nodeId, document, onCommand }: {
  nodeId: string; document: WorkspaceDocument; onCommand: (command: WorkspaceCommand) => void;
}) {
  const assigned = document.parameters.filter(parameter => parameter.sourceNodeId === nodeId);
  return <details className="nodrag nopan"><summary>Присвоить параметру</summary><label className="field">
    <select value="" onChange={event => { if (event.target.value) onCommand({ type: 'parameter.assign', id: event.target.value, sourceNodeId: nodeId }); }}>
      <option value="">Выберите параметр</option>
      {document.parameters.map(parameter => <option key={parameter.id} value={parameter.id}>{document.entities.find(entity => entity.id === parameter.ownerId)?.name} / {parameter.name}</option>)}
    </select></label>
    {assigned.length > 0 && <small>Присвоено: {assigned.map(parameter => parameter.name).join(', ')}</small>}
  </details>;
}

export function NodeNameEditor({ node, onCommand }: { node: LogicNode; onCommand: (command: WorkspaceCommand) => void }) {
  const [name, setName] = useState(node.data.label);
  const [error, setError] = useState('');
  useEffect(() => setName(node.data.label), [node.data.label]);
  return <label className="field nodrag nopan">Название блока<input value={name} onChange={event => setName(event.target.value)}
    onBlur={() => {
      const nextName = name.trim();
      if (!nextName) { setName(node.data.label); setError('Введите непустое имя. Возвращено прежнее имя.'); return; }
      setError('');
      if (nextName !== node.data.label) onCommand({ type: 'logic.rename', id: node.id, name: nextName });
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />{error && <small role="alert">{error}</small>}</label>;
}
