import { useEffect, useRef, useState } from 'react';
import { canEditCommonFormula, commonParameterGroups } from '../workspace/common-parameters.ts';
import type { WorkspaceCommand, WorkspaceDocument, WorkspaceParameter } from '../workspace/document.ts';

function CommonRow({document,ids,parameter,onCommand}:{document:WorkspaceDocument;ids:string[];parameter:WorkspaceParameter;onCommand:(command:WorkspaceCommand)=>void}) {
  const [name,setName]=useState(parameter.name),[value,setValue]=useState(String(parameter.value));
  const [min,setMin]=useState(parameter.controls?.min===undefined?'':String(parameter.controls.min));
  const [max,setMax]=useState(parameter.controls?.max===undefined?'':String(parameter.controls.max));
  const [step,setStep]=useState(parameter.controls?.step===undefined?'':String(parameter.controls.step));
  const source=document.logic.nodes.find(n=>n.id===parameter.sourceNodeId);
  const originalExpression=source?.data.calculation?.expression;
  const [expression,setExpression]=useState(originalExpression??'');
  const [error,setError]=useState('');
  const parse=(text:string)=>text.trim()===''?undefined:Number(text.replace(',','.'));
  return <form className="common-parameter" onSubmit={event=>{
    event.preventDefault();const controls={min:parse(min),max:parse(max),step:parse(step)}, number=parse(value);
    if(!name.trim()||(!parameter.sourceNodeId&&(number===undefined||!Number.isFinite(number)))||Object.values(controls).some(n=>n!==undefined&&!Number.isFinite(n))||(controls.step!==undefined&&controls.step<=0)||(controls.min!==undefined&&controls.max!==undefined&&controls.min>controls.max)){setError('Проверьте имя, значение и границы.');return;}
    if(originalExpression!==undefined&&expression!==originalExpression&&!expression.trim()){setError('Введите формулу.');return;}
    setError('');onCommand({type:'parameters.batch-update',ids,name,value:parameter.sourceNodeId?undefined:number,controls,...(originalExpression!==undefined&&expression!==originalExpression?{expression}:{})});
  }}><div className="common-parameter-fields"><label className="field">Название<input value={name} onChange={e=>setName(e.target.value)}/></label><label className="field">Значение<input value={value} disabled={Boolean(parameter.sourceNodeId)} onChange={e=>setValue(e.target.value)}/></label><button className="primary">Применить</button></div>
  {originalExpression!==undefined?<label className="field">Формула<input value={expression} disabled={!canEditCommonFormula(document,ids)} onChange={e=>setExpression(e.target.value)}/>{!canEditCommonFormula(document,ids)&&<small>Источник используется и в других местах схемы.</small>}</label>:parameter.sourceNodeId&&<small>Значение задаётся источником в схеме.</small>}
  <details><summary>Границы и шаг</summary><div className="common-parameter-fields">{([['Минимум',min,setMin],['Максимум',max,setMax],['Шаг',step,setStep]] as const).map(([label,current,change])=><label className="field" key={label}>{label}<input value={current} onChange={e=>change(e.target.value)}/></label>)}</div></details>{error&&<p role="alert">{error}</p>}</form>;
}
export function CommonParametersDialog({document,ids,onCommand,onClose}:{document:WorkspaceDocument;ids:string[];onCommand:(command:WorkspaceCommand)=>void;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 const groups=commonParameterGroups(document,ids);
 return <dialog ref={dialog} className="entity-create-dialog" onCancel={onClose}><div className="section-heading"><h2>Общие параметры</h2><span className="header-spacer"/><button className="icon-button" aria-label="Закрыть" onClick={onClose}>×</button></div>
 {groups.length?groups.map(group=><CommonRow key={group.ids.join(':')} document={document} ids={group.ids} parameter={group.parameter} onCommand={onCommand}/>):<p>Совпадающих параметров больше нет.</p>}</dialog>;
}
