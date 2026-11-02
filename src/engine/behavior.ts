import {runGraph,pollGraph} from './node-graph.ts';
import type {GraphState} from './node-graph.ts';
import { evaluateWorkspace } from './calculations.ts';
import { spatialValue, spatialScene } from './spatial.ts';
import { containsPoint, traceShapes } from './scene-geometry.ts';
import { applyWorkspaceCommand } from '../workspace/document.ts';
import type { Motion, Rate } from './playback.ts';
import type { WorkspaceDocument, LogicNode } from '../workspace/document.ts';
export interface EventDefinition { trigger: 'manual' | 'enter' | 'inside' | 'leave' | 'condition' | 'visibility'; pointId?: string; zoneId?: string; observerId?:string; targetId?:string; obstacleGroupId?:string; parameterId?:string; threshold?:number; comparison?:'gt'|'gte'|'lte'|'eq'; contextEntityId?:string }
export interface ActionDefinition { operation: 'set' | 'add' | 'move' | 'translate' | 'path' | 'rate' | 'emit'; targetId: string; pathId?: string; duration?: number }
export interface BehaviorResult { status: 'done' | 'error'; message: string }
export interface EventOccurrence { eventId:string; name:string; tick:number; values:{id:string;name:string;value:number}[] }
export interface BehaviorState { graph?:GraphState; events?:EventOccurrence[]; inside: Record<string, boolean>; results: Record<string, BehaviorResult> }
export interface ExecutionClock { time:number; schedulePath:(targetId:string,pathId:string)=>void; scheduleRate:(targetId:string,rate:number,duration:number)=>void; checkpoint:()=>{motions:Motion[];rates:Rate[];effects?:Rate[]}; restore:(state:{motions:Motion[];rates:Rate[];effects?:Rate[]})=>void }
export function executeEvent(initial: WorkspaceDocument, eventId: string, clock?:ExecutionClock): WorkspaceDocument {
  if(initial.logic.nodes.find(n=>n.id===eventId)?.data.graph)return runGraph(initial,eventId,clock?.time??0);
  if (initial.recording) throw new Error('Завершите или отмените запись перед выполнением событий.');
  const checkpoint=clock?.checkpoint();
  let document = initial, steps = 0;
  const results: Record<string, BehaviorResult> = {};
  let active = eventId;
  const occurrences:EventOccurrence[]=[];
  function next(id: string, handle: string, stack: Set<string>) {
    const edges = document.logic.edges.filter(e => e.source === id && e.sourceHandle === handle && e.targetHandle === 'exec');
    for(const edge of edges) visit(edge.target, stack);
  }
  function value(node: LogicNode) {
    const result = evaluateWorkspace(document)[`node:${node.id}`];
    if (!result || result.status === 'error') throw new Error(result?.status === 'error' ? result.message : 'Настройте выражение блока.');
    return result.value;
  }
  function visit(id: string, stack: Set<string>) {
    active = id;
    if (++steps > 4096 || stack.size >= 128) throw new Error('Превышен предел мгновенного исполнения. Разделите поведение на шаги.');
    if (stack.has(id)) throw new Error('Цикл связей выполнения. Используйте явный ограниченный повтор.');
    const node = document.logic.nodes.find(n => n.id === id);
    if (!node) throw new Error('Исполняемый блок удалён. Исправьте связь.');
    const path = new Set(stack).add(id);
    let output = 'then';
    if (node.data.role === 'event') {
      const context=node.data.event?.contextEntityId;
      if(context&&!document.entities.some(entity=>entity.id===context))throw new Error('Контекст события удалён.');
      occurrences.push({eventId:id,name:node.data.label,tick:clock?.time??0,values:document.parameters.filter(parameter=>parameter.ownerId===context).map(parameter=>{const result=evaluateWorkspace(document)[`parameter:${parameter.id}`];if(!result||result.status==='error'||typeof result.value!=='number')throw new Error('Данные контекста события не вычисляются.');return {id:parameter.id,name:parameter.name,value:result.value};})});
      document={...document,behavior:{...document.behavior,events:[...(initial.behavior.events??[]),...occurrences]}};
    } else if (node.data.role === 'condition') {
      const result = value(node);
      if (typeof result !== 'boolean') throw new Error('Условие должно возвращать true или false.');
      output = result ? 'true' : 'false';
    } else if (node.data.role === 'repeat') {
      const count = value(node);
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 1000) throw new Error('Число повторов: целое от 0 до 1000.');
      for (let index = 0; index < count; index++) next(id, 'body', path);
    } else if (node.data.role === 'action') {
      const action = node.data.action;
      if (!action) throw new Error('Выберите действие и получателя.');
      if(action.operation==='emit'){const target=document.logic.nodes.find(n=>n.id===action.targetId);if(target?.data.role!=='event')throw new Error('Выберите вызываемое событие.');visit(target.id,path);}
      else if (action.operation === 'set' || action.operation === 'add' || action.operation === 'rate') {
        const parameter = document.parameters.find(p => p.id === action.targetId);
        if (!parameter) throw new Error('Параметр действия удалён или не выбран.');
        const result = value(node);
        if (typeof result !== 'number') throw new Error('Действию над параметром нужно одно число.');
        if(action.operation==='rate'){
          if(!clock)throw new Error('Эффект во времени доступен в проигрывании.');
          if(typeof action.duration!=='number'||!Number.isInteger(action.duration)||action.duration<1||action.duration>10000)throw new Error('Длительность эффекта: целое число тиков от 1 до 10 000.');
          if(parameter.sourceNodeId)throw new Error('Нельзя менять вычисляемый параметр.');
          clock.scheduleRate(parameter.id,result,action.duration);
        } else document = applyWorkspaceCommand(document, { type: 'parameter.update', id: parameter.id, update: { value: action.operation === 'set' ? result : parameter.value + result } });
      } else {
        const point = document.shapes.find(s => s.id === action.targetId && s.kind === 'point');
        if (!point) throw new Error('Точка действия удалена или не выбрана.');
        let vector: unknown;
        if (action.operation === 'path') {
          const recorded = document.paths.find(p => p.id === action.pathId);
          if (!recorded) throw new Error('Путь действия удалён или не выбран.');
          if(clock){clock.schedulePath(point.id,recorded.id);const first=recorded.points[0];vector=[first.x,first.y];}else{const end = recorded.points.at(-1)!; vector = [end.x,end.y];}
        } else vector = value(node);
        if (!Array.isArray(vector) || vector.length !== 2 || vector.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw new Error('Положению/смещению нужна пара чисел [x,y].');
        document = applyWorkspaceCommand(document, { type: 'shape.update', id: point.id, update: { x: vector[0] + (action.operation === 'translate' ? point.x : 0), y: vector[1] + (action.operation === 'translate' ? point.y : 0) } });
      }
    } else throw new Error('Этот блок не принимает сигнал выполнения.');
    results[id] = { status: 'done', message: node.data.role==='condition'?`Выбрана ветка: ${output}`:'Выполнено' };
    next(id, output, path);
  }
  try {
    const event = initial.logic.nodes.find(n => n.id === eventId);
    if (event?.data.role !== 'event') throw new Error('Выберите блок события.');
    visit(eventId, new Set());
    results[eventId] = { status: 'done', message: `Выполнено шагов: ${steps}` };
    return { ...document, evaluations:evaluateWorkspace(document), revision: initial.revision, behavior: { ...initial.behavior, events:[...(initial.behavior.events??[]),...occurrences].slice(-100), results: { ...initial.behavior.results, ...results } } };
  } catch (error) {
    if(checkpoint)clock!.restore(checkpoint);
    const result: BehaviorResult = { status: 'error', message: error instanceof Error ? error.message : 'Исполнение невозможно.' };
    return { ...initial, behavior: { ...initial.behavior, results: { ...initial.behavior.results, [active]: result, [eventId]: result } } };
  }
}
export function checkEvents(initial: WorkspaceDocument, clock?:ExecutionClock, includeInside = true, fireTransitions = true): WorkspaceDocument {
  if (initial.recording) throw new Error('Завершите или отмените запись перед проверкой событий.');
  let document = { ...initial, behavior: { ...initial.behavior, inside: { ...initial.behavior.inside }, results: {} } } as WorkspaceDocument;
  // Membership is sampled once before actions. Actions become visible to the next explicit step.
  const snapshot = evaluateWorkspace(initial);
  for (const node of initial.logic.nodes.filter(n => !n.data.graph && n.data.role === 'event' && n.data.event?.trigger !== 'manual' && n.data.event)) {
    try {
      const event = node.data.event!;
      if(event.trigger==='condition'){
        const result=snapshot[`parameter:${event.parameterId}`];
        if(!result||result.status==='error'||typeof result.value!=='number'||!Number.isFinite(event.threshold))throw new Error('Выберите числовой параметр и порог события.');
        const current=event.comparison==='lte'?result.value<=event.threshold!:event.comparison==='eq'?result.value===event.threshold!:event.comparison==='gt'?result.value>event.threshold!:result.value>=event.threshold!;
        const before=initial.behavior.inside[node.id]??false;
        document.behavior.inside[node.id]=current;
        if(current&&!before&&fireTransitions)document=executeEvent(document,node.id,clock);
        continue;
      }
      if(event.trigger==='visibility'){
        const observer=initial.shapes.find(s=>s.id===event.observerId&&s.kind==='point');
        const target=initial.shapes.find(s=>s.id===event.targetId&&s.kind==='point');
        const view=initial.shapes.find(s=>s.id===event.zoneId&&s.kind==='chart');
        const group=initial.sceneGroups.find(g=>g.id===event.obstacleGroupId);
        if(!observer||!target||!view||!group)throw new Error('Для проверки видимости нужны наблюдатель, цель, сектор и группа преград.');
        const shapes=spatialScene(initial,id=>{const value=snapshot[`parameter:${id}`];if(!value||value.status==='error')throw new Error('Геометрия преграды не вычисляется.');return value.value as number;});
        const origin={x:observer.x,y:observer.y},destination={x:target.x,y:target.y};
        const inView=containsPoint(shapes.find(s=>s.id===view.id)!,destination);
        const obstacleIds=new Set(group.shapeIds);
        const obstructions=traceShapes(shapes.filter(s=>obstacleIds.has(s.id)&&s.id!==observer.id&&s.id!==target.id&&s.id!==view.id),origin,destination);
        const visible=inView&&obstructions.length===0;
        const before=initial.behavior.inside[node.id]??false;
        document.behavior.inside[node.id]=visible;
        if(visible&&includeInside&&fireTransitions)document=executeEvent(document,node.id,clock);
        else if(!visible&&before)document.behavior.results[node.id]={status:'done',message:'Наблюдатель потерял цель из виду.'};
        continue;
      }
      const connected=(handle:'point'|'zone',fallback:string|undefined)=>{const edge=initial.logic.edges.find(e=>e.target===node.id&&e.targetHandle===handle);if(!edge)return fallback;const context=initial.logic.nodes.find(n=>n.id===edge.source),shape=initial.shapes.find(s=>edge.sourceHandle===`shape:${s.id}`);if(context?.data.role!=='context'||!shape?.entityId||!context.data.contextEntityIds?.includes(shape.entityId))throw new Error('Объект контекста удалён или больше не связан с сущностью.');return shape.id;};
      const pointId=connected('point',event.pointId),zoneId=connected('zone',event.zoneId);
      if (!initial.shapes.some(s => s.id === pointId && s.kind === 'point')) throw new Error('Выберите существующую точку события.');
      const inside = spatialValue(initial, { operation: 'inside', originId: pointId!, targetId: zoneId }, id => {
        const value = snapshot[`parameter:${id}`];
        if (!value || value.status === 'error') throw new Error('Радиус области не вычисляется.');
        return value.value;
      }) as boolean;
      const before = initial.behavior.inside[node.id] ?? false;
      document.behavior.inside[node.id] = inside;
      if (fireTransitions && (event.trigger === 'inside' ? inside && includeInside : event.trigger === 'enter' ? inside && !before : !inside && before)) document = executeEvent(document, node.id, clock);
    } catch (error) {
      document.behavior.results[node.id] = { status: 'error', message: error instanceof Error ? error.message : 'Проверьте событие.' };
    }
  }
  return { ...pollGraph(document,clock?.time??0,fireTransitions), revision: initial.revision };
}
