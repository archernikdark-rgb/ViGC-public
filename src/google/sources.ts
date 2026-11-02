import type { WorkspaceDocument } from '../workspace/document.ts';
import type { Playback } from '../engine/playback.ts';
import { parseExpression } from '../engine/expression.ts';
import type { Expression } from '../engine/expression.ts';
import type { CellBinding, LocalData, SheetSource } from './exchange.ts';
import { cellRange } from './exchange.ts';
export function sourceValues(doc:WorkspaceDocument,p:Playback,source:SheetSource):number[]{
 if(source.kind==='snapshot'||source.kind==='snapshot-all'){
  const s=p.snapshots.find(v=>v.id===source.id);if(!s)throw Error('Снимок удалён. Измените или удалите привязку.');
  if(source.kind==='snapshot-all')return [...s.values.map(v=>v.value),...s.positions.flatMap(v=>[v.x,v.y])];
  const item=source.axis==='value'?s.values.find(v=>v.id===source.entryId):s.positions.find(v=>v.id===source.entryId);
  if(!item)throw Error('Значение снимка удалено.');return [source.axis==='value'?(item as {value:number}).value:(item as {x:number;y:number})[source.axis]];
 }
 const result=doc.evaluations[`${source.kind}:${source.id}`];
 if(!result||result.status==='error')throw Error(result?.message??'Источник удалён. Выберите другой.');
 const values=Array.isArray(result.value)?result.value:[result.value];
 if(!values.length||values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Источник должен содержать конечные числа.');
 return values as number[];
}
export function writable(doc:WorkspaceDocument,source:SheetSource){return source.kind==='snapshot'||source.kind==='snapshot-all'||(source.kind==='parameter'&&doc.parameters.some(p=>p.id===source.id&&!p.sourceNodeId));}
export function bindingData(doc:WorkspaceDocument,p:Playback,b:CellBinding):LocalData{
 const values=sourceValues(doc,p,b.source);cellRange(b.sheet,b.address,values.length);
 if(b.direction!=='out'&&!writable(doc,b.source))throw Error('Вычисляемый источник допускает только запись в таблицу.');
 return b.mode==='formula'?{values,formula:sheetFormula(doc,b)}:{values};
}
export function sourceOptions(doc:WorkspaceDocument,p:Playback):{source:SheetSource;label:string}[]{
 return [
  ...doc.parameters.map(v=>({source:{kind:'parameter' as const,id:v.id},label:`${doc.entities.find(e=>e.id===v.ownerId)?.name??'Участник'} / ${v.name}`})),
  ...doc.logic.nodes.filter(n=>['calculate','variable','spatial'].includes(n.data.role)).map(v=>({source:{kind:'node' as const,id:v.id},label:`Схема / ${v.data.label}`})),
  ...p.snapshots.flatMap(s=>[
   {source:{kind:'snapshot-all' as const,id:s.id},label:`${s.name} / все значения (числа, затем x,y точек)`},
   ...s.values.map(v=>({source:{kind:'snapshot' as const,id:s.id,entryId:v.id,axis:'value' as const},label:`${s.name} / ${v.name}`})),
   ...s.positions.flatMap(v=>(['x','y'] as const).map(axis=>({source:{kind:'snapshot' as const,id:s.id,entryId:v.id,axis},label:`${s.name} / ${v.name}.${axis}`})))
  ])
 ];
}
export function sheetFormula(doc:WorkspaceDocument,b:CellBinding):string {
 if(b.source.kind!=='node')throw Error('Формула доступна только для вычисляемого блока.');
 const visiting=new Set<string>();
 function source(kind:'parameter'|'node',id:string,root=false):string {
  const key=`${kind}:${id}`;if(visiting.has(key)||visiting.size>128)throw Error('Циклическая или слишком длинная формула.');
  visiting.add(key);
  try{
   const linked=!root&&doc.sheets.find(v=>v.id!==b.id&&v.spreadsheetId===b.spreadsheetId&&v.source.kind===kind&&v.source.id===id&&!v.address.includes(':'));
   if(linked)return cellRange(linked.sheet,linked.address);
   if(kind==='parameter'){const p=doc.parameters.find(v=>v.id===id);if(!p)throw Error('Вход формулы удалён.');return p.sourceNodeId?source('node',p.sourceNodeId):String(p.value);}
   const n=doc.logic.nodes.find(v=>v.id===id);if(!n)throw Error('Блок формулы удалён.');
   if(n.data.role==='variable')return String(n.data.variableValue??0);
   if(n.data.role==='read'){const r=doc.references.find(v=>v.target.kind==='logic-node'&&v.target.id===id);if(!r)throw Error('Вход чтения не назначен.');return source('parameter',r.parameterId);}
   const c=n.data.calculation;if(!c||n.data.role==='spatial')throw Error('Этот источник нельзя перевести в формулу Sheets. Выберите числовой результат.');
   function emit(e:Expression):string{
    if(e.kind==='number')return String(e.value);
    if(e.kind==='name'){
     if(e.name==='pi')return 'PI()';if(e.name==='true'||e.name==='false')return e.name.toUpperCase();
     const input=c!.inputs.find(v=>v.alias===e.name),edge=input&&doc.logic.edges.find(v=>v.target===id&&v.targetHandle===input.id&&v.sourceHandle==='value');
     if(!edge)throw Error('Не подключён вход формулы.');return source('node',edge.source);
    }
    if(e.kind==='array')throw Error('Списки в формуле Sheets пока не поддерживаются. Выберите числовой результат и диапазон.');
    if(e.kind==='unary')return e.operator==='!'?`NOT(${emit(e.operand)})`:`(${e.operator}${emit(e.operand)})`;
    if(e.kind==='binary'){
     if(e.operator==='&&')return `IF(${emit(e.left)},${emit(e.right)},FALSE)`;
     if(e.operator==='||')return `IF(${emit(e.left)},TRUE,${emit(e.right)})`;
     return `(${emit(e.left)}${e.operator==='=='?'=':e.operator==='!='?'<>':e.operator}${emit(e.right)})`;
    }
    const names:Record<string,string>={if:'IF',abs:'ABS',sqrt:'SQRT',sin:'SIN',cos:'COS',min:'MIN',max:'MAX',sum:'SUM',mean:'AVERAGE',median:'MEDIAN'};
    if(e.name==='atan2')return `ATAN2(${emit(e.args[1])},${emit(e.args[0])})`;
    if(!names[e.name])throw Error(`Функция ${e.name} не переводится в Sheets. Выберите числовой результат.`);
    return `${names[e.name]}(${e.args.map(emit).join(',')})`;
   }
   return emit(parseExpression(c.expression));
  }finally{visiting.delete(key);}
 }
 const formula='='+source('node',b.source.id,true);if(formula.length>50000)throw Error('Формула слишком длинная для Sheets.');return formula;
}
