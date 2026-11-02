import {spatialScene} from './spatial.ts';
import {evaluateWorkspace} from './calculations.ts';
import {calculateExpression} from './expression.ts';
import {containsPoint,traceShapes} from './scene-geometry.ts';
import type {WorkspaceDocument,LogicNode,LogicEdge} from '../workspace/document.ts';
export type PortType='number'|'boolean'|'entity'|'point'|'area'|'set'|'record'|'parameter'|'event'|'effect'|'object'|'exec';
export interface GraphReference {kind:'graph-reference';type:PortType;ids:string[];values?:Record<string,boolean>}
export type GraphValue=number|boolean|number[]|GraphReference;
export type GraphOperation='sources'|'changes'|'trace'|'number'|'boolean'|'entity'|'point'|'area'|'set'|'parameter'|'position'|'inside'|'nearby'|'blocked'|'split'|'count'|'compare'|'and'|'or'|'not'|'math'|'select'|'expression'|'trigger'|'event'|'event-count'|'finish'|'set-value'|'add'|'rate'|'multiply'|'stop'|'timer'|'move'|'sequence'|'repeat'|'observe'|'branch';
export interface SourceField {id:string;label:string;type:'number'|'point'|'area'|'entity';referenceId:string;key?:string}
export interface ChangeRow {id:string;label:string;operation:'set-value'|'add'|'rate'|'multiply';amount?:number;parameterId?:string}
export interface GraphDefinition {fields?:SourceField[];changes?:ChangeRow[];keys?:string[];shownOutputs?:string[];multipleOrigins?:boolean;operation:GraphOperation;referenceId?:string;ids?:string[];value?:number|boolean;operator?:string;expression?:string;aliases?:string[];defaults?:Record<string,number|boolean>;key?:string;all?:boolean;}
export interface GraphPort {id:string;label:string;type:PortType;optional?:boolean}
export const graphLabels:Record<GraphOperation,string>={sources:'Источники',changes:'Изменить параметры',trace:'Трейс',number:'Число',boolean:'Да / Нет',entity:'Сущность',point:'Точка',area:'Область',set:'Набор',parameter:'Параметр',position:'Положение',inside:'Находится в зоне?',nearby:'Объекты в радиусе',blocked:'Есть преграда?',split:'Результат зоны',count:'Количество',compare:'Сравнение',and:'И',or:'ИЛИ',not:'НЕ',math:'Математика',select:'Выбор значения',expression:'Выражение',trigger:'Ручной триггер',event:'Событие','event-count':'Количество стаков',finish:'Завершить событие','set-value':'Изменить параметр',add:'Прибавить к параметру',rate:'Изменение во времени',multiply:'Применить множитель',stop:'Остановить влияние',timer:'Окно / таймер',move:'Переместить',sequence:'Последовательно',repeat:'Повторить',observe:'Показать значение',branch:'Проверка условия'};
const p=(id:string,label:string,type:PortType,optional=false):GraphPort=>({id,label,type,optional});
function baseGraphPorts(g:GraphDefinition):{inputs:GraphPort[];outputs:GraphPort[]} {
 const result=(inputs:GraphPort[],outputs:GraphPort[])=>({inputs,outputs}),v=p('value','Значение','number'),e=p('exec','Запуск','exec'),then=p('then','Далее','exec');
 switch(g.operation){
 case 'sources':return result([],(g.fields??[]).map(f=>p(f.id,f.label,f.type)));
 case 'changes':return result([e,...(g.changes??[]).flatMap(r=>[p(r.id+':parameter',r.label,'parameter'),p(r.id+':amount','Значение','number',r.amount!==undefined)])],[then,...(g.changes??[]).filter(r=>['rate','multiply'].includes(r.operation)).map(r=>p(r.id+':effect',r.label,'effect'))]);
 case 'trace':return result([p('from',g.multipleOrigins?'Наблюдатели':'Начало',g.multipleOrigins?'set':'point'),p('to','Цель','point'),p('objects','Проверяемые объекты','set'),p('range','Дальность','number'),...(g.multipleOrigins?[p('zones','Секторы','set')]:[])],[p('reached','Цель первая','boolean'),p('hit','Есть попадание','boolean'),p('object','Первый объект','object'),p('point','Точка попадания','point'),p('distance','Расстояние','number')]);
 case 'number':return result([],[v]);case 'boolean':return result([],[p('value','Да / Нет','boolean')]);
 case 'entity':case 'point':case 'area':return result([],[p('value',graphLabels[g.operation],g.operation)]);
 case 'set':return result([],[p('value','Набор','set')]);
 case 'parameter':return result([p('value','Зависимость','number',true)],[v]);
 case 'position':return result([p('entity','Сущность','entity')],[p('value','Точка','point')]);
 case 'inside':return result([p('point','Точка','point'),p('areas','Области','set')],[p('value','По областям','record'),...(g.keys??[]).map(key=>p('area:'+key,key,'boolean'))]);
 case 'split':return result([p('record','Результаты','record')],[p('value',g.key||'Область','boolean')]);
 case 'nearby':return result([p('point','Центр','point'),p('objects','Объекты','set'),p('radius','Радиус','number')],[p('value','Найденные','set')]);
 case 'blocked':return result([p('from','Откуда','point'),p('to','Куда','point'),p('areas','Преграды','set')],[p('value','Есть преграда','boolean')]);
 case 'count':return result([p('set','Набор','set')],[v]);
 case 'compare':return result([p('x','Значение','number'),p('y','Порог','number')],[p('value','Результат','boolean')]);
 case 'and':case 'or':return result((g.aliases??['a','b']).map(id=>p(id,id,'boolean')),[p('value','Результат','boolean')]);
 case 'not':return result([p('x','Условие','boolean')],[p('value','Результат','boolean')]);
 case 'math':return result([p('x','x','number'),p('y','y','number')],[v]);
 case 'expression':return result((g.aliases??['x']).map(id=>p(id,id,'number')),[v]);
 case 'select':return result([p('condition','Условие','boolean'),p('yes','Если Да','number'),p('no','Если Нет','number')],[v]);
 case 'branch':return result([p('exec','Проверить','exec',true),p('condition','Условие','boolean')],[p('true','Да','exec'),p('false','Нет','exec')]);
 case 'trigger':return result([],[then]);
 case 'event':return result([e,p('condition','Условие','boolean',true)],[then,p('value','Событие','event')]);
 case 'event-count':return result([p('event','Событие','event')],[v]);
 case 'finish':return result([e,p('event',g.all?'События':'Событие','event',true)],[then]);
 case 'set-value':case 'add':return result([e,p('parameter','Параметр','parameter'),p('amount','Значение','number')],[then]);
 case 'multiply':case 'rate':return result([e,p('parameter','Параметр','parameter'),p('amount',g.operation==='rate'?'В секунду':'Значение','number')],[then,p('value','Влияние','effect')]);
 case 'stop':return result([e,p('effect','Влияние','effect')],[then]);
 case 'timer':return result([e,p('duration','Тиков','number')],[p('then','Началось','exec'),p('done','Закончилось','exec')]);
 case 'move':return result([e,p('point','Кого','point'),p('target','Куда','point')],[then]);
 case 'sequence':return result([e],[p('first','1','exec'),p('then','2','exec')]);
 case 'repeat':return result([e,p('count','Повторов','number')],[p('body','Повтор','exec'),then]);
 case 'observe':return result([p('input','Значение','number')],[]);
 }
}
const predicates=new Set<GraphOperation>(['compare','and','or','not','inside']);
export function graphPorts(g:GraphDefinition){const ports=baseGraphPorts(g);if(predicates.has(g.operation)&&!(g.operation==='inside'&&(g.keys?.length??0)>1)){ports.inputs.push(p('exec','Проверить','exec',true));ports.outputs.push(p('true','Да','exec',true),p('false','Нет','exec',true));}return ports;}
export function multipleGraphInput(logic:WorkspaceDocument['logic'],nodeId:string,handle?:string|null){const g=logic.nodes.find(n=>n.id===nodeId)?.data.graph;return !!g&&graphPorts(g).inputs.some(p=>p.id===handle&&(p.type==='set'||g.operation==='finish'&&p.type==='event'));}
export function validateGraph(g:GraphDefinition){if(!g||!(g.operation in graphLabels))throw Error('Неизвестная операция ноды.');for(const f of g.fields??[])if(!f.id||!f.label||!['number','point','area','entity'].includes(f.type)||typeof f.referenceId!=='string')throw Error('Некорректный источник.');if(new Set(g.fields?.map(f=>f.id)).size!==(g.fields?.length??0))throw Error('Источники должны иметь разные пины.');for(const r of g.changes??[])if(!r.id||!r.label||!['set-value','add','rate','multiply'].includes(r.operation)||(r.amount!==undefined&&!Number.isFinite(r.amount)))throw Error('Некорректное изменение.');if(new Set(g.changes?.map(r=>r.id)).size!==(g.changes?.length??0))throw Error('Изменения должны иметь разные пины.');for(const key of ['referenceId','key','operator','expression'] as const)if(g[key]!==undefined&&typeof g[key]!=='string')throw Error('Некорректная настройка ноды.');if(g.ids&&(!Array.isArray(g.ids)||g.ids.some(id=>typeof id!=='string')))throw Error('Нужен набор ID объектов.');if(g.multipleOrigins!==undefined&&typeof g.multipleOrigins!=='boolean')throw Error('Некорректный режим лучей.');for(const list of [g.keys,g.shownOutputs])if(list&&(!Array.isArray(list)||list.some(x=>typeof x!=='string')))throw Error('Некорректные выходы.');if(g.all!==undefined&&typeof g.all!=='boolean')throw Error('Некорректный способ завершения.');if(g.value!==undefined&&typeof g.value!=='boolean'&&(typeof g.value!=='number'||!Number.isFinite(g.value)))throw Error('Нужно конечное значение.');for(const val of Object.values(g.defaults??{}))if(typeof val!=='boolean'&&(typeof val!=='number'||!Number.isFinite(val)))throw Error('Некорректное значение входа.');if(g.aliases&&(new Set(g.aliases).size!==g.aliases.length||g.aliases.some(x=>!/^[_\p{L}][\p{L}\p{N}_]*$/u.test(x))))throw Error('Имена входов должны быть уникальными.');}
export function graphConnection(logic:WorkspaceDocument['logic'],edge:Omit<LogicEdge,'id'>):'value'|'exec'{
 const a=logic.nodes.find(n=>n.id===edge.source)?.data.graph,b=logic.nodes.find(n=>n.id===edge.target)?.data.graph;
 if(!a||!b)throw Error('Подключите совместимые типизированные ноды.');
 const out=graphPorts(a).outputs.find(p=>p.id===edge.sourceHandle),input=graphPorts(b).inputs.find(p=>p.id===edge.targetHandle);
 if(!out||!input)throw Error('Пин отсутствует.');
 const convertible=(a.operation==='parameter'||a.operation==='sources')&&out.type==='number'&&input.type==='parameter'||out.type==='entity'&&input.type==='point'||['area','point','entity','object'].includes(out.type)&&input.type==='set';
 if(out.type!==input.type&&!convertible)throw Error(`Вход требует «${({number:'Число',boolean:'Да / Нет',entity:'Сущность',point:'Точка',area:'Область',set:'Набор',record:'Результаты по областям',parameter:'Параметр',event:'Событие',effect:'Влияние',object:'Объект геометрии',exec:'Выполнение'})[input.type]}», подключён «${out.type}».`);
 return input.type==='exec'?'exec':'value';
}
export interface GraphCall {id:string;eventId:string}
export interface GraphEffect {id:string;nodeId:string;callId?:string;parameterId:string;operation:'rate'|'multiply';amount:number;amountHandle?:string}
export interface GraphTimer {nodeId:string;callId?:string;end:number}
export interface GraphState {serial:number;calls:GraphCall[];effects:GraphEffect[];timers:GraphTimer[];conditions:Record<string,boolean>;time:number}
export function graphState(d:WorkspaceDocument):GraphState{return d.behavior.graph??{serial:0,calls:[],effects:[],timers:[],conditions:{},time:0};}
const ref=(type:PortType,ids:string[],values?:Record<string,boolean>):GraphReference=>({kind:'graph-reference',type,ids,...(values?{values}:{})});
export function isGraphReference(v:GraphValue):v is GraphReference{return typeof v==='object'&&!Array.isArray(v)&&v.kind==='graph-reference';}
export function graphEvaluator(d:WorkspaceDocument){
 const cache=new Map<string,GraphValue>(),visiting=new Set<string>();
 function readParameter(id:string):number{const p=d.parameters.find(p=>p.id===id);if(!p)throw Error('Параметр удалён.');let value=p.sourceNodeId?number(read(p.sourceNodeId)):p.value;for(const effect of graphState(d).effects.filter(e=>e.operation==='multiply'&&e.parameterId===id))value+=p.value*(effect.amount-1);return value;}
 function input(node:LogicNode,id:string):GraphValue{
  const edges=d.logic.edges.filter(e=>e.target===node.id&&e.targetHandle===id),port=graphPorts(node.data.graph!).inputs.find(p=>p.id===id);
  if(edges.length){const values=edges.map(edge=>{const source=d.logic.nodes.find(n=>n.id===edge.source)?.data.graph;const field=source?.fields?.find(f=>f.id===edge.sourceHandle);let value=port?.type==='parameter'&&(source?.operation==='parameter'||field?.type==='number')?ref('parameter',[field?.referenceId??source?.referenceId??'']):read(edge.source,edge.sourceHandle??'value');
   if(isGraphReference(value)&&value.type==='entity'&&port?.type==='point'){const points=d.shapes.filter(s=>s.kind==='point'&&s.entityId&&(value as GraphReference).ids.includes(s.entityId));if(points.length!==1)throw Error('Сущности нужна одна точка для автоматического преобразования.');value=ref('point',[points[0].id]);}return value;});
   if(port?.type==='set'||port?.type==='event'&&node.data.graph!.operation==='finish')return ref(port.type,[...new Set(values.flatMap(v=>reference(v).ids))]);return values[0];}
  const row=node.data.graph!.changes?.find(r=>r.id+':parameter'===id);if(row?.parameterId)return ref('parameter',[row.parameterId]);
  const value=node.data.graph!.defaults?.[id];if(value!==undefined)return value;throw Error(`Подключите вход «${graphPorts(node.data.graph!).inputs.find(p=>p.id===id)?.label??id}».`);
 }
 function number(v:GraphValue):number{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Ожидалось конечное число.');return v;}
 function boolean(v:GraphValue):boolean{if(typeof v!=='boolean')throw Error('Ожидалось Да / Нет.');return v;}
 function reference(v:GraphValue):GraphReference{if(!isGraphReference(v))throw Error('Нужна ссылка на объект.');return v;}
 function point(v:GraphValue){if(Array.isArray(v)&&v.length===2)return {id:'',x:v[0],y:v[1]};const id=reference(v).ids[0];const shape=d.shapes.find(s=>s.id===id&&s.kind==='point');if(!shape)throw Error('Точка удалена.');return shape;}
 function read(id:string,handle='value'):GraphValue{
  const key=id+':'+handle;if(cache.has(key))return cache.get(key)!;if(visiting.has(key)||visiting.size>128)throw Error('Циклическая зависимость данных.');visiting.add(key);
  try{const node=d.logic.nodes.find(n=>n.id===id),g=node?.data.graph;if(!node||!g)throw Error('Типизированная нода удалена.');const get=(id:string)=>input(node,id);let value:GraphValue;
   switch(g.operation){
    case 'sources':{if(handle==='value'){value=ref('record',(g.fields??[]).map(f=>f.referenceId));break;}const f=g.fields?.find(f=>f.id===handle);if(!f)throw Error('Источник удалён.');value=f.type==='number'?readParameter(f.referenceId):ref(f.type,[f.referenceId]);break;}
    case 'changes':value=ref('effect',graphState(d).effects.filter(e=>e.nodeId===id&&(!handle.endsWith(':effect')||e.amountHandle===handle.replace(':effect',':amount'))).map(e=>e.id));break;
    case 'trace':{
     const origins=g.multipleOrigins?reference(get('from')).ids.map(id=>point(ref('point',[id]))):[point(get('from'))],target=point(get('to')),range=number(get('range'));
     if(range<=0)throw Error('Дальность должна быть положительной.');const scene=spatialScene(d,readParameter),zones=g.multipleOrigins?reference(get('zones')).ids.map(id=>scene.find(s=>s.id===id)):[];
     const contacts=origins.filter(origin=>!g.multipleOrigins||zones.some(zone=>zone?.centerPointId===origin.id&&containsPoint(zone,target))).map(from=>{const distance=Math.hypot(target.x-from.x,target.y-from.y),factor=distance?Math.min(1,range/distance):1,to={x:from.x+(target.x-from.x)*factor,y:from.y+(target.y-from.y)*factor};const ids=new Set(reference(get('objects')).ids);ids.add(target.id);ids.delete(from.id);const hit=traceShapes(scene.filter(s=>ids.has(s.id)),from,to)[0];return {hit,to,distance:Math.min(range,distance)};});
     const contact=contacts.find(c=>c.hit?.shapeId===target.id)??contacts.sort((a,b)=>(a.hit?.distance??Infinity)-(b.hit?.distance??Infinity))[0],hit=contact?.hit;
     value=handle==='reached'?contacts.some(c=>c.hit?.shapeId===target.id):handle==='hit'?contacts.some(c=>!!c.hit):handle==='object'?ref('object',hit?[hit.shapeId]:[]):handle==='point'?[hit?.point.x??contact?.to.x??target.x,hit?.point.y??contact?.to.y??target.y]:handle==='distance'?hit?.distance??contact?.distance??0:false;break;}
    case 'number':case 'boolean':value=g.value??(g.operation==='boolean'?false:0);break;
    case 'entity':case 'point':case 'area':value=ref(g.operation,[g.referenceId??'']);break;
    case 'set':value=ref('set',g.ids??[]);break;
    case 'parameter':{const p=d.parameters.find(p=>p.id===g.referenceId);if(!p)throw Error('Выберите параметр.');value=handle==='ref'?ref('parameter',[p.id]):d.logic.edges.some(e=>e.target===id&&e.targetHandle==='value')?number(get('value')):p.sourceNodeId&&p.sourceNodeId!==id?number(read(p.sourceNodeId)):p.value;if(handle!=='ref')for(const effect of graphState(d).effects.filter(e=>e.operation==='multiply'&&e.parameterId===p.id))value=number(value)+p.value*(effect.amount-1);break;}
    case 'position':{const entities=reference(get('entity')).ids;const points=d.shapes.filter(s=>s.kind==='point'&&s.entityId&&entities.includes(s.entityId));if(points.length!==1)throw Error('Выберите сущность с одной точкой.');value=ref('point',[points[0].id]);break;}
    case 'inside':{const target=point(get('point')),areas=reference(get('areas')).ids,values:Record<string,boolean>={};for(const id of areas){const area=spatialScene(d,readParameter).find(s=>s.id===id);if(!area||!['circle','chart','rectangle','polygon'].includes(area.kind))throw Error('Область удалена.');values[id]=containsPoint(area,target);}for(const edge of d.logic.edges.filter(e=>e.target===node.id&&e.targetHandle==='areas')){const field=d.logic.nodes.find(n=>n.id===edge.source)?.data.graph?.fields?.find(f=>f.id===edge.sourceHandle);if(field?.key&&field.referenceId in values)values[field.key]=values[field.referenceId];}value=handle.startsWith('area:')?values[handle.slice(5)]:ref('record',areas,values);break;}
    case 'split':{const r=reference(get('record'));if(!r.values||!(g.key! in r.values))throw Error('Выберите результат существующей области.');value=r.values[g.key!];break;}
    case 'nearby':{const center=point(get('point')),radius=number(get('radius'));if(radius<0)throw Error('Радиус не может быть отрицательным.');value=ref('set',reference(get('objects')).ids.filter(id=>{const s=d.shapes.find(s=>s.id===id);if(!s)throw Error('Объект набора удалён.');return Math.hypot(s.x-center.x,s.y-center.y)<=radius;}));break;}
    case 'blocked':{const from=point(get('from')),to=point(get('to')),ids=reference(get('areas')).ids;value=traceShapes(spatialScene(d,readParameter).filter(s=>ids.includes(s.id)),from,to).length>0;break;}
    case 'count':value=reference(get('set')).ids.length;break;
    case 'compare':{const x=number(get('x')),y=number(get('y'));value=g.operator==='<'?x<y:g.operator==='<='?x<=y:g.operator==='>='?x>=y:g.operator==='=='?x===y:g.operator==='!='?x!==y:x>y;break;}
    case 'and':case 'or':{const values=(g.aliases??['a','b']).map(id=>boolean(get(id)));value=g.operation==='and'?values.every(Boolean):values.some(Boolean);break;}
    case 'not':value=!boolean(get('x'));break;
    case 'math':{const x=number(get('x')),y=number(get('y'));value=g.operator==='-'?x-y:g.operator==='*'?x*y:g.operator==='/'?x/y:g.operator==='^'?x**y:g.operator==='%'?x*y/100:x+y;break;}
    case 'expression':value=calculateExpression((g.expression??'x').replace(/@([\p{L}_][\p{L}\p{N}_]*)/gu,'$1'),alias=>get(alias) as number);break;
    case 'select':value=get(boolean(get('condition'))?'yes':'no');break;
    case 'event':value=ref('event',[id]);break;
    case 'event-count':value=graphState(d).calls.filter(c=>reference(get('event')).ids.includes(c.eventId)).length;break;
    case 'rate':case 'multiply':case 'set-value':case 'add':value=ref('effect',graphState(d).effects.filter(e=>e.nodeId===id).map(e=>e.id));break;
    case 'observe':value=get('input');break;
    default:throw Error('У этой ноды нет значения.');
   }
   if(typeof value==='number'&&!Number.isFinite(value))throw Error('Результат не является конечным числом.');cache.set(key,value);return value;
  }finally{visiting.delete(key);}
 }
 function condition(id:string){const v=read(id);if(isGraphReference(v)&&v.type==='record'&&v.values&&v.ids.length===1)return v.values[v.ids[0]];return boolean(v);}
 return {read,input,number,boolean,reference,point,readParameter,condition};
}
export function runGraph(initial:WorkspaceDocument,nodeId:string,time=0,callId?:string,output?:string):WorkspaceDocument{
 let d=structuredClone(initial),state=structuredClone(graphState(d));state.time=time;d.behavior.graph=state;let steps=0;
 const follow=(id:string,handle:string,callId?:string,path=new Set<string>())=>{for(const edge of d.logic.edges.filter(e=>e.source===id&&e.sourceHandle===handle&&e.targetHandle==='exec'))visit(edge.target,callId,new Set(path));};
 const finish=(ids:string[])=>{state.calls=state.calls.filter(c=>!ids.includes(c.id));state.effects=state.effects.filter(e=>!e.callId||!ids.includes(e.callId));state.timers=state.timers.filter(e=>!e.callId||!ids.includes(e.callId));};
 function visit(id:string,current:string|undefined,path:Set<string>){if(++steps>4096||path.has(id))throw Error('Цикл выполнения: используйте ограниченный повтор или таймер.');path.add(id);const n=d.logic.nodes.find(n=>n.id===id),g=n?.data.graph;if(!n||!g)throw Error('Нода выполнения удалена.');const ev=graphEvaluator(d),get=(id:string)=>ev.input(n,id),num=(id:string)=>ev.number(get(id));
  switch(g.operation){
   case 'compare':case 'and':case 'or':case 'not':case 'inside':{const result=ev.condition(id);follow(id,result?'true':'false',current,path);return;}
   case 'changes':{for(const row of g.changes??[]){const parameterId=ev.reference(get(row.id+':parameter')).ids[0],p=d.parameters.find(p=>p.id===parameterId);if(!p||p.sourceNodeId)throw Error('Для изменения нужен параметр с ручным значением.');const amount=d.logic.edges.some(e=>e.target===id&&e.targetHandle===row.id+':amount')?num(row.id+':amount'):row.amount??0;if(row.operation==='set-value')p.value=amount;else if(row.operation==='add')p.value+=amount;else state.effects.push({id:`effect-${++state.serial}`,nodeId:id,callId:current,parameterId,operation:row.operation,amount,amountHandle:row.id+':amount'});}break;}
   case 'branch':follow(id,ev.boolean(get('condition'))?'true':'false',current,path);return;
   case 'trigger':break;
   case 'event':{if(d.logic.edges.some(e=>e.target===id&&e.targetHandle==='condition')&&!ev.boolean(get('condition')))return;current=`call-${++state.serial}`;state.calls.push({id:current,eventId:id});d.behavior.events=[...(d.behavior.events??[]),{eventId:id,name:n.data.label,tick:time,values:[]}].slice(-100);break;}
   case 'finish':{const edge=d.logic.edges.find(e=>e.target===id&&e.targetHandle==='event');if(g.all){const events=edge?ev.reference(get('event')).ids:[g.referenceId??''];finish(state.calls.filter(c=>events.includes(c.eventId)).map(c=>c.id));}else if(current)finish([current]);else throw Error('Завершение текущего вызова должно быть в цепочке события.');break;}
   case 'set-value':case 'add':case 'rate':case 'multiply':{const parameterId=ev.reference(get('parameter')).ids[0],p=d.parameters.find(p=>p.id===parameterId);if(!p||p.sourceNodeId)throw Error('Для изменения нужен параметр с ручным значением.');const amount=num('amount');if(g.operation==='set-value')p.value=amount;else if(g.operation==='add')p.value+=amount;else state.effects.push({id:`effect-${++state.serial}`,nodeId:id,callId:current,parameterId,operation:g.operation,amount});break;}
   case 'stop':{const ids=ev.reference(get('effect')).ids;state.effects=state.effects.filter(e=>!ids.includes(e.id));break;}
   case 'timer':{const duration=num('duration');if(!Number.isInteger(duration)||duration<1||duration>10000)throw Error('Окно: от 1 до 10000 целых тиков.');state.timers.push({nodeId:id,callId:current,end:time+duration});break;}
   case 'move':{const p=ev.point(get('point')),target=ev.point(get('target'));p.x=target.x;p.y=target.y;break;}
   case 'sequence':follow(id,'first',current,path);break;
   case 'repeat':{const count=num('count');if(!Number.isInteger(count)||count<0||count>1000)throw Error('Повторов: от 0 до 1000.');for(let i=0;i<count;i++)follow(id,'body',current,path);break;}
   default:throw Error('Нода не принимает выполнение.');
  }
  d.behavior.results[id]={status:'done',message:'Выполнено'};follow(id,'then',current,path);
 }
 try{if(output)follow(nodeId,output,callId);else visit(nodeId,callId,new Set());return {...d,evaluations:evaluateWorkspace(d)};}catch(error){return {...initial,behavior:{...initial.behavior,results:{...initial.behavior.results,[nodeId]:{status:'error',message:error instanceof Error?error.message:'Ошибка графа.'}}}};}
}
export function pollGraph(initial:WorkspaceDocument,time:number,fire=true):WorkspaceDocument{
 if(!initial.logic.nodes.some(n=>n.data.graph))return initial;
 let d=structuredClone(initial);d.behavior.graph=structuredClone(graphState(d));const values=graphEvaluator(initial);
 for(const n of initial.logic.nodes){const g=n.data.graph;if(!g||initial.logic.edges.some(e=>e.target===n.id&&e.targetHandle==='exec'))continue;const legacy=['event','branch'].includes(g.operation)&&initial.logic.edges.some(e=>e.target===n.id&&e.targetHandle==='condition');const predicate=predicates.has(g.operation)&&initial.logic.edges.some(e=>e.source===n.id&&['true','false'].includes(e.sourceHandle??''));if(!legacy&&!predicate)continue;
  try{const value=predicate?values.condition(n.id):values.boolean(values.input(n,'condition')),before=graphState(initial).conditions[n.id]??false;d.behavior.graph!.conditions[n.id]=value;if(fire&&(g.operation==='event'?value&&!before:value!==before))d=runGraph(d,n.id,time);}catch(error){d.behavior.results[n.id]={status:'error',message:error instanceof Error?error.message:'Проверьте условие.'};}}

 return {...d,evaluations:evaluateWorkspace(d)};
}
export function advanceGraph(initial:WorkspaceDocument,from:number,to:number,tickSeconds:number):WorkspaceDocument{
 if(!initial.logic.nodes.some(n=>n.data.graph))return initial;
 let d=structuredClone(initial);d.behavior.graph=structuredClone(graphState(d));const state=d.behavior.graph;
 const due=state.timers.filter(t=>t.end<=to+1e-9).sort((a,b)=>a.end-b.end);
 // Caller splits at every timer boundary, so effects never run beyond their owner completion.
 const sample=graphEvaluator(d),changes=new Map<string,number>();
 for(const effect of state.effects)if(effect.operation==='rate'){const node=d.logic.nodes.find(n=>n.id===effect.nodeId);const amount=node?effect.amountHandle&&!d.logic.edges.some(e=>e.target===node.id&&e.targetHandle===effect.amountHandle)?effect.amount:sample.number(sample.input(node,effect.amountHandle??'amount')):effect.amount;changes.set(effect.parameterId,(changes.get(effect.parameterId)??0)+amount*(to-from)*tickSeconds);}
 for(const parameter of d.parameters)parameter.value+=changes.get(parameter.id)??0;
 state.time=to;state.timers=state.timers.filter(t=>!due.includes(t));
 for(const timer of due)if(!timer.callId||graphState(d).calls.some(c=>c.id===timer.callId))d=runGraph(d,timer.nodeId,timer.end,timer.callId,'done');
 return {...d,evaluations:evaluateWorkspace(d)};
}
