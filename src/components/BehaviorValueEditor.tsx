import {useState} from 'react';
import {CalculationEditor} from './CalculationEditor.tsx';
import {NumericField} from './NumericField.tsx';
import type {LogicNode,WorkspaceDocument,WorkspaceCommand} from '../workspace/document.ts';

export function BehaviorValueEditor({node,document,onCommand}:{node:LogicNode;document:WorkspaceDocument;onCommand:(command:WorkspaceCommand)=>void}){
 const calculation=node.data.calculation??{expression:node.data.role==='condition'?'':'0',inputs:[]};
 const expression=calculation.expression.trim();
 const numericComparison=expression.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/u);
 const booleanConstant=/^(true|false)$/.test(expression);
 const constantNumber=/^-?\d+(?:\.\d+)?$/.test(expression);
 const condition=node.data.role==='condition';
 const simple=condition?(Boolean(numericComparison)||booleanConstant||expression===''):constantNumber;
 const [advanced,setAdvanced]=useState(!simple);
 const save=(expression:string,inputs=calculation.inputs)=>onCommand({type:'calculation.update',nodeId:node.id,calculation:{...calculation,expression,inputs}});
 const alias=numericComparison?.[1]??'';
 const operator=numericComparison?.[2]??'>';
 const right=numericComparison?.[3]??'0';
 const sourceName=(id:string,fallback:string)=>{
  const edge=document.logic.edges.find(e=>e.target===node.id&&e.targetHandle===id);
  const source=document.logic.nodes.find(n=>n.id===edge?.source);
  if(edge?.sourceHandle?.startsWith('parameter:')){
   const parameter=document.parameters.find(p=>p.id===edge.sourceHandle!.slice('parameter:'.length));
   const owner=document.entities.find(e=>e.id===parameter?.ownerId);
   return parameter?`${owner?.name??'Сущность'} / ${parameter.name}`:fallback;
  }
  return source?.data.label??(edge?fallback:'Источник не подключён');
 };
 function addNumericInput(){
  let index=1;while(calculation.inputs.some(input=>input.alias===`значение_${index}`))index++;
  const input={id:crypto.randomUUID(),alias:`значение_${index}`};
  save(`${input.alias} > 0`,[...calculation.inputs,input]);
 }
 return <div className="behavior-value-editor">
  {advanced?<div className="behavior-formula-mode"><CalculationEditor node={node} document={document} onCommand={onCommand}/><button className="expression-mode" disabled={!simple} onClick={()=>setAdvanced(false)}>Назад к простому условию</button></div>:condition?numericComparison? <>
   <label className="field">Число для проверки<select aria-label="Число для проверки" value={alias} onChange={e=>save(`${e.target.value} ${operator} ${right}`)}>{calculation.inputs.map(input=><option key={input.id} value={input.alias}>{sourceName(input.id,input.alias)}</option>)}</select></label>
   <label className="field">Сравнение<select value={operator} onChange={e=>save(`${alias} ${e.target.value} ${right}`)}>{[['==','Равно'],['!=','Не равно'],['>','Больше'],['<','Меньше'],['>=','Не меньше'],['<=','Не больше']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <NumericField label="Порог" value={Number(right)} onChange={value=>save(`${alias} ${operator} ${value}`)}/>
   {calculation.inputs.find(input=>input.alias===alias)&&<small>Источник: {sourceName(calculation.inputs.find(input=>input.alias===alias)!.id,alias)}</small>}
  </>:booleanConstant?<label className="field">Постоянное условие<select value={expression} onChange={e=>save(e.target.value)}><option value="true">Всегда истинно</option><option value="false">Всегда ложно</option></select></label>:<>
   <p className="condition-empty">Задайте числовой вход и порог для проверки.</p>
   <button type="button" className="expression-mode" onClick={addNumericInput}>Добавить числовой вход</button>
  </>:<div className="behavior-value-simple"><NumericField label={node.data.action?.operation==='add'?'Прибавить на':'Значение'} value={Number(expression)} onChange={value=>save(String(value))}/><button className="expression-mode" onClick={()=>setAdvanced(value=>!value)}>{advanced?'Назад к значению':'Настроить формулой…'}</button></div>}
  {condition&&!advanced&&<button className="expression-mode" onClick={()=>setAdvanced(true)}>Открыть формулу…</button>}
 </div>;
}
