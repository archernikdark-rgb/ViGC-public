import {graphConnection,validateGraph,multipleGraphInput} from '../engine/node-graph.ts';
import type {GraphDefinition} from '../engine/node-graph.ts';
import { normalizeLayerOrder } from './layers.ts';
import { canEditCommonFormula, parameterSignature } from './common-parameters.ts';
import { geometryValue, shapeProperties, shapeLabels, validateGeometry } from './geometry.ts';
import type { ShapeProperty } from './geometry.ts';
import { beginRecording, sampleRecording } from './paths.ts';
import type { RecordedPath, RecordingDraft } from './paths.ts';
import { executeEvent, checkEvents } from '../engine/behavior.ts';
import type { EventDefinition, ActionDefinition, BehaviorState } from '../engine/behavior.ts';
import {spatialLabels} from '../engine/spatial.ts';
import type { SpatialDefinition } from '../engine/spatial.ts';
import { descendants, validateHierarchy, groupNodes, ungroupNodes, duplicateNodes, moveSceneGroup, groupPorts, descendants as subtree } from './composition.ts';
import { evaluateWorkspace, readParameterValue } from '../engine/calculations.ts';
import type { CalculationDefinition, CalculationResult } from '../engine/calculations.ts';
import { readCircleCenter, readTargetParameter } from './bindings.ts';
import type { CellBinding } from '../google/exchange.ts';
export type ShapeKind = 'circle' | 'point' | 'text' | 'arrow' | 'rectangle' | 'polygon' | 'chart' | 'comment' | 'value';
export interface SceneShape {
  id: string;
  kind: ShapeKind;
  name: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  transparency: number;
  entityId?: string;
  centerPointId?: string;
  width?: number; height?: number; sides?: number; innerRadius?: number; fillPercent?: number; rotation?: number;
  labelVisible?: boolean; comment?: string; collapsed?: boolean;
  displayParameterId?: string;
  geometryLocked?: boolean; collisionEnabled?: boolean;
  anchors?: {id:string;name:string;x:number;y:number}[];
}

export interface LogicNode {
  id: string;
  type: 'draft';
  parentId?: string;
  position: { x: number; y: number };
  data: { graph?:GraphDefinition; label: string; role: 'note' | 'event' | 'context' | 'read' | 'calculate' | 'variable' | 'group' | 'condition' | 'action' | 'spatial' | 'repeat'; note?:string; noteCollapsed?:boolean; contextEntityIds?: string[]; contextParameterOrder?: string[]; event?: EventDefinition; action?: ActionDefinition; spatial?: SpatialDefinition; exposedPorts?: string[]; calculation?: CalculationDefinition; variableValue?: number };
}

export interface LogicEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface WorkspaceEntity {
  id: string;
  name: string;
  labelVisible?: boolean; parentId?: string; folder?: boolean;
}

export interface WorkspaceParameter {
  id: string;
  ownerId: string;
  name: string;
  value: number;
  sourceNodeId?: string;
  controls?: ParameterControls;
}

export interface ParameterControls { min?: number; max?: number; step?: number }

export interface ParameterReference {
  id: string;
  parameterId: string;
  target: { kind: 'shape' | 'logic-node'; id: string; property?: ShapeProperty };
}

export interface WorkspaceDocument {
  id: string;
  name: string;
  revision: number;
  shapes: SceneShape[];
  logic: { nodes: LogicNode[]; edges: LogicEdge[] };
  paths: RecordedPath[];
  recording: RecordingDraft | null;
  behavior: BehaviorState;
  sceneGroups: { id: string; name: string; shapeIds: string[]; parentId?: string }[];
  entities: WorkspaceEntity[];
  parameters: WorkspaceParameter[];
  references: ParameterReference[];
  sheets: CellBinding[];
  modified: boolean;
  evaluations: Record<string, CalculationResult>;
}

export type WorkspaceCommand =
  | {type:'graph.configure';id:string;definition:GraphDefinition}
  | { type: 'project.rename'; name: string }
  | { type: 'project.reset'; id: string }
  | { type: 'shape.add'; kind: ShapeKind; id: string; position: { x: number; y: number }; geometry?: Partial<Pick<SceneShape,'width'|'height'|'radius'|'innerRadius'|'rotation'>> }
  | { type: 'scene.duplicate'; shapeIds:string[]; copyId:string }
  | { type: 'display.add'; id:string; parameterId:string; position:{x:number;y:number} }
  | { type: 'display.bind'; id:string; parameterId:string }
  | { type: 'shape.update'; id: string; update: Partial<Omit<SceneShape, 'id' | 'kind' | 'entityId' | 'centerPointId'>> }
  | { type: 'shape.remove'; id: string }
  | { type: 'behavior.configure'; nodeId: string; configuration: Pick<LogicNode['data'], 'event' | 'action' | 'spatial'> }
  | { type: 'behavior.fire'; nodeId: string }
  | { type: 'behavior.check' }
  | { type: 'group.ports'; nodeId: string; portIds: string[] }
  | { type: 'path.begin'; pointId: string }
  | { type: 'path.cancel' }
  | { type: 'path.finish'; id: string; name: string; duration: number }
  | { type: 'path.duration'; id: string; duration: number }
  | { type: 'path.remove'; id: string }
  | { type:'note.create'; id:string; position:{x:number;y:number}; parentId?:string }
  | { type:'note.update'; id:string; text?:string; collapsed?:boolean }
  | { type: 'context.order'; id:string; entityId:string; parameterIds:string[] }
  | { type: 'context.members'; id:string; entityIds:string[] }
  | { type: 'context.create'; id:string; entityIds:string[]; position:{x:number;y:number} }
  | { type: 'parameters.batch-update'; ids:string[]; name:string; value?:number; controls:ParameterControls; expression?:string }
  | { type: 'logic.group'; id: string; nodeIds: string[]; name: string }
  | { type: 'logic.ungroup'; id: string }
  | { type: 'logic.duplicate'; nodeIds: string[]; copyId: string }
  | { type: 'logic.remove'; nodeIds: string[] }
  | { type: 'scene.group'; id: string; name: string; shapeIds: string[] }
  | { type: 'scene.ungroup'; id: string }
  | { type: 'logic.disconnect'; edgeId: string }
  | { type: 'logic.connect'; edge: LogicEdge }
  | { type: 'logic.create-connected'; node: LogicNode; edge: LogicEdge }
  | { type: 'logic.rename'; id: string; name: string }
  | { type: 'logic.replace'; logic: { nodes: LogicNode[]; edges: LogicEdge[] } }
  | { type: 'entity.add'; entity: WorkspaceEntity }
  | { type: 'entity.create'; entity: WorkspaceEntity; parameters: WorkspaceParameter[] }
  | { type: 'entity.rename'; id: string; name: string }
  | { type: 'entity.visibility'; id: string; visible: boolean }
  | { type: 'entity.reparent'; ids: string[]; parentId: string | null }
  | { type: 'entity.remove'; id: string }
  | { type: 'object.link'; shapeId: string; create?: {kind:ShapeKind;position:{x:number;y:number}}; entityId: string; parameterId?: string; property?:ShapeProperty }
  | { type: 'entity.ungroup'; id:string }
  | { type: 'scene.rename'; id:string; name:string }
  | { type: 'entity.group'; id: string; ids: string[]; name: string }
  | { type: 'scene.wrap'; id: string; shapeIds: string[]; groupIds: string[]; name: string }
  | { type: 'shape.bind-entity'; shapeId: string; entityId: string | null }
  | { type: 'scene.organize'; shapeIds: string[]; groupIds: string[]; parentId: string | null }
  | { type: 'scene.order'; id: string; beforeId: string | null; parentId?:string|null }
  | { type: 'selection.remove'; shapeIds: string[]; entityIds: string[]; nodeIds: string[]; groupIds: string[] }
  | { type: 'circle.bind-center'; circleId: string; pointId: string | null }
  | { type: 'point.bind-entity'; pointId: string; entityId: string | null }
  | { type: 'parameter.add'; parameter: WorkspaceParameter }
  | { type: 'parameter.update'; id: string; update: Partial<Pick<WorkspaceParameter, 'name' | 'value'>> }
  | { type: 'parameter.controls'; id: string; controls: ParameterControls }
  | { type: 'parameter.assign'; id: string; sourceNodeId: string | null }
  | { type: 'calculation.update'; nodeId: string; calculation: CalculationDefinition }
  | { type: 'variable.update'; nodeId: string; value: number }
  | { type: 'parameter.remove'; id: string }
  | { type: 'reference.add'; reference: ParameterReference }
  | { type: 'reference.bind'; referenceId: string; target: ParameterReference['target']; parameterId: string }
  | { type: 'reference.remove'; id: string };

export class WorkspaceCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceCommandError';
  }
}

export function newDocument(id: string = crypto.randomUUID()): WorkspaceDocument {
  return {
    id,
    name: 'untitled',
    revision: 0,
    shapes: [],
    sceneGroups: [],
    paths: [], recording: null, behavior: { inside: {}, results: {} },
    logic: { nodes: [], edges: [] },
    entities: [],
    parameters: [],
    references: [],
    sheets: [],
    modified: false,
    evaluations: {},
  };
}

function withChange(document: WorkspaceDocument, update: Partial<WorkspaceDocument>): WorkspaceDocument {
  let next = { ...document, ...update, revision: document.revision + 1, modified: true };
  const oldGraphParameters=new Set(document.logic.nodes.filter(n=>n.data.graph?.operation==='parameter'&&document.logic.edges.some(e=>e.target===n.id&&e.targetHandle==='value')).map(n=>n.data.graph!.referenceId));
  next={...next,parameters:next.parameters.map(parameter=>{const source=next.logic.nodes.find(n=>n.data.graph?.operation==='parameter'&&n.data.graph.referenceId===parameter.id&&next.logic.edges.some(e=>e.target===n.id&&e.targetHandle==='value'));if(source)return {...parameter,sourceNodeId:source.id};if(oldGraphParameters.has(parameter.id)){const {sourceNodeId,...rest}=parameter;return rest;}return parameter;})};
  return { ...next, evaluations: evaluateWorkspace(next) };
}

function requireUniqueId(records: { id: string }[], id: string, label: string) {
  if (records.some(record => record.id === id)) throw new WorkspaceCommandError(`${label} с таким ID уже существует.`);
}

function requireRecord<T extends { id: string }>(records: T[], id: string, label: string): T {
  const record = records.find(item => item.id === id);
  if (!record) throw new WorkspaceCommandError(`${label} не найден: ${id}.`);
  return record;
}

export function logicConnectionKind(logic: WorkspaceDocument['logic'], edge: Omit<LogicEdge,'id'>): 'value' | 'exec' {
  const source = requireRecord(logic.nodes, edge.source, 'Источник');
  const target = requireRecord(logic.nodes, edge.target, 'Получатель');
  if(source.data.graph||target.data.graph)return graphConnection(logic,edge);
  const outputs = source.data.role === 'condition' ? ['true','false'] : source.data.role === 'repeat' ? ['body','then'] : ['event','action'].includes(source.data.role) ? ['then'] : [];
  if (edge.targetHandle === 'exec' && outputs.includes(edge.sourceHandle ?? '') && ['condition','action','repeat'].includes(target.data.role)) return 'exec';
  if (source.data.role === 'context' && edge.sourceHandle?.startsWith('shape:') && target.data.role === 'spatial' && ['origin','target'].includes(edge.targetHandle ?? '')) return 'value';
  if (source.data.role === 'context' && edge.sourceHandle?.startsWith('shape:') && target.data.role === 'event' && ['point','zone'].includes(edge.targetHandle ?? '')) return 'value';
  if (((['read','calculate','variable','condition','spatial'].includes(source.data.role) && edge.sourceHandle === 'value') || (['context','event'].includes(source.data.role) && typeof edge.sourceHandle==='string' && edge.sourceHandle.startsWith('parameter:'))) && ['calculate','condition','action','repeat'].includes(target.data.role) && target.data.calculation?.inputs.some(input => input.id === edge.targetHandle)) return 'value';
  throw new WorkspaceCommandError('Соедините совместимые порты данных или выполнения.');
}
function connectLogic(logic: WorkspaceDocument['logic'], edge: LogicEdge): WorkspaceDocument['logic'] {
  const kind = logicConnectionKind(logic, edge);
  const edges = logic.edges.filter(item => kind === 'exec'||multipleGraphInput(logic,edge.target,edge.targetHandle) ? !(item.source === edge.source && item.sourceHandle === edge.sourceHandle && item.target===edge.target && item.targetHandle===edge.targetHandle) : !(item.target === edge.target && item.targetHandle === edge.targetHandle));
  requireUniqueId(edges, edge.id, 'Связь');
  return { ...logic, edges: [...edges,edge] };
}

function validateContextEdge(document:WorkspaceDocument,edge:LogicEdge) {
  const node=document.logic.nodes.find(n=>n.id===edge.source);
  if(node?.data.role!=='context')return;
  const handle=edge.sourceHandle;
  if(handle?.startsWith('shape:')) {
    const shape=document.shapes.find(s=>s.id===handle.slice('shape:'.length));
    if(!shape?.entityId||!node.data.contextEntityIds?.includes(shape.entityId)) throw new WorkspaceCommandError('Объект не принадлежит контексту.');
    const target=document.logic.nodes.find(n=>n.id===edge.target);
    if(target?.data.role==='event'&&((edge.targetHandle==='point'&&shape.kind!=='point')||(edge.targetHandle==='zone'&&shape.kind!=='circle')))throw new WorkspaceCommandError('Для события нужны точка и круглая область.');
    return;
  }
  if(!handle?.startsWith('parameter:')) throw new WorkspaceCommandError('Выберите параметр контекста.');
  const parameter=document.parameters.find(p=>p.id===handle.slice('parameter:'.length));
  if(!parameter||!node.data.contextEntityIds?.includes(parameter.ownerId)) throw new WorkspaceCommandError('Параметр не принадлежит контексту.');
}

export function applyWorkspaceCommand(document: WorkspaceDocument, command: WorkspaceCommand): WorkspaceDocument {
  switch (command.type) {
    case 'graph.configure':validateGraph(command.definition);return withChange(document,{logic:{...document.logic,nodes:document.logic.nodes.map(n=>n.id===command.id?{...n,data:{...n.data,graph:command.definition}}:n)}});
    case 'project.rename':
      return withChange(document, { name: command.name });
    case 'project.reset':
      return { ...newDocument(command.id), revision: document.revision + 1 };
    case 'display.add': {
      const parameter=requireRecord(document.parameters,command.parameterId,'Параметр');
      const added=applyWorkspaceCommand(document,{type:'shape.add',kind:'value',id:command.id,position:command.position});
      return {...added,shapes:added.shapes.map(shape=>shape.id===command.id?{...shape,name:parameter.name,displayParameterId:parameter.id}:shape)};
    }
    case 'display.bind': {
      const shape=requireRecord(document.shapes,command.id,'Отображение');if(shape.kind!=='value')throw new WorkspaceCommandError('Выберите отображение параметра.');
      requireRecord(document.parameters,command.parameterId,'Параметр');
      return withChange(document,{shapes:document.shapes.map(item=>item.id===shape.id?{...item,displayParameterId:command.parameterId}:item)});
    }
    case 'shape.add': {
      requireUniqueId(document.shapes, command.id, 'Фигура');
      const count = document.shapes.filter(shape => shape.kind === command.kind).length + 1;
      const shape: SceneShape = {
        id: command.id,
        kind: command.kind,
        name: `${shapeLabels[command.kind]} ${count}`,
        ...command.position,
        radius: 90,
        color: '#8f6ad1',
        transparency: command.kind === 'point' || command.kind === 'comment' || command.kind === 'value' ? 0 : 30,
        ...(command.kind === 'comment' ? { comment:'Комментарий', collapsed:false } : {}),
        ...command.geometry,
      };
      validateGeometry(shape);
      return withChange(document, { shapes: [...document.shapes, shape] });
    }
    case 'shape.update': {
      const shape = requireRecord(document.shapes, command.id, 'Фигура');
      if (document.recording && command.id !== document.recording.pointId && (command.update.x !== undefined || command.update.y !== undefined)) throw new WorkspaceCommandError('Во время записи перемещайте только выбранную точку.');
      validateGeometry({ ...shape, ...command.update });
      const { radius, x, y, ...appearance } = command.update;
      if ((x !== undefined && !Number.isFinite(x)) || (y !== undefined && !Number.isFinite(y))) throw new WorkspaceCommandError('Координаты должны быть конечными числами.');
      let parameters = document.parameters;
      let geometryUpdate: Partial<SceneShape> = { ...appearance };
      for (const property of shapeProperties(shape.kind).filter(p => p !== 'radius')) {
        const value=command.update[property]; if(value===undefined)continue;
        const reading=readTargetParameter(document,{kind:'shape',id:shape.id,property});
        if(reading.status==='missing'||reading.status==='error')throw new WorkspaceCommandError('Исправьте потерянный или ошибочный источник свойства.');
        if(reading.status==='resolved') {
          if(reading.parameter.sourceNodeId)throw new WorkspaceCommandError('Свойство вычисляется схемой. Измените источник.');
          parameters=parameters.map(p=>p.id===reading.parameter.id?{...p,value}:p);
          delete geometryUpdate[property];
        }
      }
      if (radius !== undefined) {
        if (!Number.isFinite(radius) || radius <= 0) throw new WorkspaceCommandError('Радиус должен быть больше 0.');
        const reading = readTargetParameter(document, { kind: 'shape', id: shape.id });
        if (reading.status === 'error') throw new WorkspaceCommandError(reading.message);
        if (reading.status === 'missing') throw new WorkspaceCommandError('Источник радиуса удалён. Выберите параметр.');
        if (reading.status === 'resolved' && reading.parameter.sourceNodeId) throw new WorkspaceCommandError('Радиус задаёт формула. Измените источник вычисления.');
        if (reading.status === 'resolved') parameters = parameters.map(parameter => parameter.id === reading.parameter.id ? { ...parameter, value: radius } : parameter);
        else geometryUpdate.radius = radius;
      }
      let positionTargetId = shape.id;
      if (x !== undefined || y !== undefined) {
        if (shape.centerPointId) {
          const point = requireRecord(document.shapes, shape.centerPointId, 'Точка центра');
          positionTargetId = point.id;
        }
        if (positionTargetId === shape.id) geometryUpdate = { ...geometryUpdate, ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }) };
      }
      const groupMove = moveSceneGroup(document, shape.id, x, y);
      if (groupMove) {
        const { x: ignoredX, y: ignoredY, ...otherGeometry } = geometryUpdate;
        const shapes = groupMove.map(item => item.id === shape.id ? { ...item, ...otherGeometry } : item);
        return withChange(document, { parameters, shapes, recording: sampleRecording(document.recording, shapes) });
      }
      const shapes = document.shapes.map(item => {
          if (item.id === shape.id) return { ...item, ...geometryUpdate };
          if (item.id === positionTargetId) return { ...item, ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }) };
          return item;
        });
      return withChange(document, { parameters, shapes, recording: sampleRecording(document.recording, shapes) });
    }
    case 'scene.duplicate': {
      if(document.recording)throw new WorkspaceCommandError('Завершите запись пути перед копированием.');
      const source=command.shapeIds.map(id=>requireRecord(document.shapes,id,'Фигура'));
      const copies=source.map((shape,i)=>{const center=shape.centerPointId?readCircleCenter(document,shape).position:null;return {...structuredClone(shape),id:`${command.copyId}-${i}`,name:`${shape.name} — копия`,x:(center?.x??shape.x)+24,y:(center?.y??shape.y)+24};});
      for(const copy of copies)requireUniqueId(document.shapes,copy.id,'Фигура');
      const ids=new Map(source.map((s,i)=>[s.id,copies[i].id]));
      for(const copy of copies)if(copy.centerPointId){if(ids.has(copy.centerPointId))copy.centerPointId=ids.get(copy.centerPointId);else delete copy.centerPointId;}
      const refs=document.references.filter(r=>r.target.kind==='shape'&&ids.has(r.target.id)).map((r,i)=>({...r,id:`${command.copyId}-ref-${i}`,target:{...r.target,id:ids.get(r.target.id)!}}));
      const groups=document.sceneGroups.filter(g=>g.shapeIds.length&&g.shapeIds.every(id=>ids.has(id)));const groupIds=new Map(groups.map((g,i)=>[g.id,`${command.copyId}-group-${i}`]));
      return withChange(document,{shapes:[...document.shapes,...copies],references:[...document.references,...refs],sceneGroups:[...document.sceneGroups,...groups.map(g=>({...g,id:groupIds.get(g.id)!,name:`${g.name} — копия`,shapeIds:g.shapeIds.map(id=>ids.get(id)!),parentId:g.parentId?groupIds.get(g.parentId):undefined}))]});
    }
    case 'shape.remove': {
      if (document.recording) throw new WorkspaceCommandError('Завершите или отмените запись перед удалением объектов.');
      const removed = document.shapes.find(shape => shape.id === command.id);
      if (!removed) return document;
      return withChange(document, {
        sceneGroups: document.sceneGroups.map(group => ({ ...group, shapeIds: group.shapeIds.filter(id => id !== command.id) })),
        shapes: document.shapes.filter(shape => shape.id !== command.id).map(shape => shape.centerPointId === removed.id ? { ...shape, x: removed.x, y: removed.y } : shape),
        references: document.references.filter(reference => !(reference.target.kind === 'shape' && reference.target.id === command.id)),
      });
    }
    case 'behavior.configure': {
      const node = requireRecord(document.logic.nodes, command.nodeId, 'Блок');
      if (!['event','action','spatial'].includes(node.data.role)) throw new WorkspaceCommandError('Выберите блок события, действия или пространства.');
      const configuration = command.configuration;
      if ((configuration.event && node.data.role !== 'event') || (configuration.action && node.data.role !== 'action') || (configuration.spatial && node.data.role !== 'spatial')) throw new WorkspaceCommandError('Настройка не соответствует роли блока.');
      const inside = { ...document.behavior.inside };
      if (configuration.event) delete inside[node.id];
      const pathAction = configuration.action?.operation === 'path';
      return withChange(document, { logic: { ...document.logic,
        nodes: document.logic.nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, ...configuration, ...(configuration.spatial&&n.data.spatial&&Object.values(spatialLabels).some(label=>label===n.data.label)?{label:spatialLabels[configuration.spatial.operation]}:{}), ...(pathAction ? {calculation:undefined} : {}) } } : n),
        edges: pathAction ? document.logic.edges.filter(e=>e.target!==node.id || e.targetHandle==='exec') : document.logic.edges,
      }, behavior: { ...document.behavior, inside } });
    }
    case 'behavior.fire': {
      const next = executeEvent({ ...document, behavior: { ...document.behavior, results: {} } }, command.nodeId);
      return withChange(document, { parameters: next.parameters, shapes: next.shapes, behavior: next.behavior });
    }
    case 'behavior.check': {
      const next = checkEvents(document);
      return withChange(document, { parameters: next.parameters, shapes: next.shapes, behavior: next.behavior });
    }
    case 'group.ports': {
      const node = requireRecord(document.logic.nodes, command.nodeId, 'Составной блок');
      if (node.data.role !== 'group') throw new WorkspaceCommandError('Выберите составной блок.');
      const ports = groupPorts(document.logic, node.id, true, document.parameters, document.shapes);
      const allowed = [...ports.inputs,...ports.outputs].map(p => p.id);
      if (command.portIds.some(id => !allowed.includes(id)) || new Set(command.portIds).size !== command.portIds.length) throw new WorkspaceCommandError('Выберите существующие внешние порты.');
      const ids = subtree(document.logic,[node.id]);
      for (const edge of document.logic.edges) {
        const port = ids.has(edge.source) && !ids.has(edge.target) ? `out:${edge.source}${edge.sourceHandle === 'value' ? '' : ':'+edge.sourceHandle}` : !ids.has(edge.source) && ids.has(edge.target) ? `in:${edge.target}:${edge.targetHandle}` : null;
        if (port && !command.portIds.includes(port)) throw new WorkspaceCommandError('Сначала отключите внешнюю связь скрываемого порта.');
      }
      return withChange(document,{logic:{...document.logic,nodes:document.logic.nodes.map(n=>n.id===node.id?{...n,data:{...n.data,exposedPorts:command.portIds}}:n)}});
    }
    case 'path.begin':
      return withChange(document,{recording:beginRecording(document,command.pointId)});
    case 'path.cancel': {
      if (!document.recording) return document;
      const positions = new Map(document.recording.originalPositions.map(p=>[p.id,p]));
      return withChange(document,{recording:null,shapes:document.shapes.map(s=>positions.has(s.id)?{...s,x:positions.get(s.id)!.x,y:positions.get(s.id)!.y}:s)});
    }
    case 'path.finish': {
      if (!document.recording || document.recording.points.length < 2) throw new WorkspaceCommandError('Запишите перемещение точки перед завершением.');
      requireUniqueId(document.paths,command.id,'Путь');
      if (!command.id || !command.name.trim() || !Number.isInteger(command.duration) || command.duration < 1 || command.duration > 10000) throw new WorkspaceCommandError('Пути нужны имя и длительность от 1 до 10 000 тиков.');
      const path: RecordedPath = {id:command.id,name:command.name.trim(),pointId:document.recording.pointId,points:document.recording.points,duration:command.duration};
      return withChange(document,{recording:null,paths:[...document.paths,path]});
    }
    case 'path.duration':
      requireRecord(document.paths,command.id,'Путь');
      if (!Number.isInteger(command.duration) || command.duration < 1 || command.duration > 10000) throw new WorkspaceCommandError('Длительность должна быть от 1 до 10 000 тиков.');
      return withChange(document,{paths:document.paths.map(p=>p.id===command.id?{...p,duration:command.duration}:p)});
    case 'path.remove':
      return withChange(document,{paths:document.paths.filter(p=>p.id!==command.id)});
    case 'note.create': {
      requireUniqueId(document.logic.nodes,command.id,'Комментарий');
      const node:LogicNode={id:command.id,type:'draft',position:command.position,...(command.parentId?{parentId:command.parentId}:{}),data:{role:'note',label:'Комментарий',note:'',noteCollapsed:false}};
      const logic={...document.logic,nodes:[...document.logic.nodes,node]};validateHierarchy(logic);return withChange(document,{logic});
    }
    case 'note.update': {
      const node=requireRecord(document.logic.nodes,command.id,'Комментарий');if(node.data.role!=='note')throw new WorkspaceCommandError('Выберите комментарий.');
      if(command.text!==undefined&&typeof command.text!=='string')throw new WorkspaceCommandError('Комментарий должен быть текстом.');
      return withChange(document,{logic:{...document.logic,nodes:document.logic.nodes.map(n=>n.id===node.id?{...n,data:{...n.data,...(command.text===undefined?{}:{note:command.text}),...(command.collapsed===undefined?{}:{noteCollapsed:command.collapsed})}}:n)}});
    }
    case 'context.order': {
      const node=requireRecord(document.logic.nodes,command.id,'Контекст');
      if(node.data.role!=='context'||!node.data.contextEntityIds?.includes(command.entityId)) throw new WorkspaceCommandError('Выберите сущность контекста.');
      const expected=document.parameters.filter(p=>p.ownerId===command.entityId).map(p=>p.id);
      if(command.parameterIds.length!==expected.length||new Set(command.parameterIds).size!==expected.length||command.parameterIds.some(id=>!expected.includes(id))) throw new WorkspaceCommandError('Выберите все параметры сущности без повторов.');
      const other=(node.data.contextParameterOrder??[]).filter(id=>!expected.includes(id));
      return withChange(document,{logic:{...document.logic,nodes:document.logic.nodes.map(n=>n.id===node.id?{...n,data:{...n.data,contextParameterOrder:[...other,...command.parameterIds]}}:n)}});
    }
    case 'context.members': {
      const node=requireRecord(document.logic.nodes,command.id,'Контекст');
      if(node.data.role!=='context'||new Set(command.entityIds).size!==command.entityIds.length) throw new WorkspaceCommandError('Выберите разные сущности контекста.');
      for(const id of command.entityIds) if(requireRecord(document.entities,id,'Сущность').folder) throw new WorkspaceCommandError('Выберите сущности, а не папку.');
      const removed=document.parameters.filter(p=>node.data.contextEntityIds?.includes(p.ownerId)&&!command.entityIds.includes(p.ownerId));
      const removedShapes=document.shapes.filter(s=>s.entityId&&node.data.contextEntityIds?.includes(s.entityId)&&!command.entityIds.includes(s.entityId));
      if(document.logic.edges.some(e=>e.source===node.id&&(removed.some(p=>e.sourceHandle===`parameter:${p.id}`)||removedShapes.some(s=>e.sourceHandle===`shape:${s.id}`)))) throw new WorkspaceCommandError('Сначала отключите связи этой сущности.');
      return withChange(document,{logic:{...document.logic,nodes:document.logic.nodes.map(n=>n.id===node.id?{...n,data:{...n.data,contextEntityIds:command.entityIds}}:n)}});
    }
    case 'context.create': {
      if(!command.id || !command.entityIds.length || new Set(command.entityIds).size!==command.entityIds.length) throw new WorkspaceCommandError('Выберите сущности для контекста.');
      requireUniqueId(document.logic.nodes,command.id,'Блок');
      for(const id of command.entityIds) if(requireRecord(document.entities,id,'Сущность').folder) throw new WorkspaceCommandError('Выберите сущности, а не папку.');
      const node:LogicNode={id:command.id,type:'draft',position:command.position,data:{role:'context',label:'Событие',contextEntityIds:command.entityIds}};
      const logic={...document.logic,nodes:[...document.logic.nodes,node]};validateHierarchy(logic);return withChange(document,{logic});
    }
    case 'logic.group':
      return withChange(document, { logic: groupNodes(document.logic, command.id, command.nodeIds, command.name) });
    case 'logic.ungroup':
      return withChange(document, { logic: ungroupNodes(document.logic, command.id) });
    case 'logic.duplicate':
      return withChange(document, duplicateNodes(document, command.nodeIds, command.copyId));
    case 'logic.remove': {
      const ids = descendants(document.logic, command.nodeIds);
      return withChange(document, {
        logic: { nodes: document.logic.nodes.filter(n => !ids.has(n.id)), edges: document.logic.edges.filter(e => !ids.has(e.source) && !ids.has(e.target)) },
        references: document.references.filter(ref => ref.target.kind !== 'logic-node' || !ids.has(ref.target.id)),
      });
    }
    case 'scene.group': {
      if (document.recording) throw new WorkspaceCommandError('Завершите или отмените запись перед изменением групп.');
      requireUniqueId(document.sceneGroups, command.id, 'Группа');
      if (!command.id || !command.name.trim() || command.shapeIds.length < 2 || new Set(command.shapeIds).size !== command.shapeIds.length) throw new WorkspaceCommandError('Выберите не менее двух разных объектов и название группы.');
      command.shapeIds.forEach(id => requireRecord(document.shapes, id, 'Объект'));
      if (document.sceneGroups.some(g => g.shapeIds.some(id => command.shapeIds.includes(id)))) throw new WorkspaceCommandError('Объект уже входит в группу. Сначала расформируйте её.');
      return withChange(document, { sceneGroups: [...document.sceneGroups, { id: command.id, name: command.name.trim(), shapeIds: command.shapeIds }] });
    }
    case 'scene.ungroup':
      if (document.recording) throw new WorkspaceCommandError('Завершите или отмените запись перед изменением групп.');
      {const group=document.sceneGroups.find(g=>g.id===command.id);return withChange(document, { sceneGroups: document.sceneGroups.filter(g => g.id !== command.id).map(g=>g.parentId===command.id?{...g,parentId:group?.parentId}:g) });}
    case 'logic.disconnect':
      return withChange(document, { logic: { ...document.logic, edges: document.logic.edges.filter(edge => edge.id !== command.edgeId) } });
    case 'logic.connect':
      validateContextEdge(document,command.edge);
      return withChange(document, { logic: connectLogic(document.logic, command.edge) });
    case 'logic.create-connected': {
      requireUniqueId(document.logic.nodes, command.node.id, 'Блок');
      validateContextEdge({...document,logic:{...document.logic,nodes:[...document.logic.nodes,command.node]}},command.edge);
      if (command.edge.target !== command.node.id) throw new WorkspaceCommandError('Связь должна вести в создаваемый блок.');
      const logic = connectLogic({ ...document.logic, nodes: [...document.logic.nodes, command.node] }, command.edge);
      validateHierarchy(logic);
      return withChange(document, { logic });
    }
    case 'logic.rename': {
      requireRecord(document.logic.nodes, command.id, 'Блок');
      const name = command.name.trim();
      if (!name) throw new WorkspaceCommandError('Введите непустое имя блока.');
      return withChange(document, { logic: { ...document.logic, nodes: document.logic.nodes.map(node => node.id === command.id ? { ...node, data: { ...node.data, label: name } } : node) } });
    }
    case 'logic.replace': {
      validateHierarchy(command.logic);
      for(const node of command.logic.nodes)if(node.data.graph)validateGraph(node.data.graph);
      const edgeIds=new Set<string>(),dataInputs=new Set<string>();
      for(const edge of command.logic.edges){if(edgeIds.has(edge.id))throw new WorkspaceCommandError('В схеме повторяется ID связи.');edgeIds.add(edge.id);if(command.logic.nodes.some(n=>(n.id===edge.source||n.id===edge.target)&&n.data.graph)){const kind=graphConnection(command.logic,edge),key=edge.target+':'+edge.targetHandle;if(kind==='value'&&!multipleGraphInput(command.logic,edge.target,edge.targetHandle)&&dataInputs.has(key))throw new WorkspaceCommandError('Вход данных принимает один источник. Используйте ноду объединения.');if(kind==='value')dataInputs.add(key);}}
      const nodeIds = new Set(command.logic.nodes.map(node => node.id));
      if (nodeIds.size !== command.logic.nodes.length) throw new WorkspaceCommandError('В схеме повторяются ID блоков.');
      for (const edge of command.logic.edges) {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new WorkspaceCommandError('Связь схемы ссылается на отсутствующий блок.');
      }
      return withChange(document, {
        logic: command.logic,
        references: document.references.filter(reference => reference.target.kind !== 'logic-node' || nodeIds.has(reference.target.id)),
      });
    }
    case 'entity.rename': {
      requireRecord(document.entities, command.id, 'Участник');
      const name = command.name.trim();
      if (!name) throw new WorkspaceCommandError('Введите имя участника.');
      return withChange(document, { entities: document.entities.map(entity => entity.id === command.id ? { ...entity, name } : entity) });
    }
    case 'circle.bind-center': {
      if (document.recording) throw new WorkspaceCommandError('Завершите или отмените запись перед изменением центра области.');
      const circle = requireRecord(document.shapes, command.circleId, 'Круг');
      if (!['circle','rectangle','polygon','chart','arrow'].includes(circle.kind)) throw new WorkspaceCommandError('Выберите геометрическую фигуру.');
      if (command.pointId !== null) {
        const point = requireRecord(document.shapes, command.pointId, 'Точка центра');
        if (point.kind !== 'point') throw new WorkspaceCommandError('Выберите точку центра.');
      }
      const position = readCircleCenter(document, circle).position ?? { x: circle.x, y: circle.y };
      return withChange(document, { shapes: document.shapes.map(shape => {
        if (shape.id !== circle.id) return shape;
        const { centerPointId, ...geometry } = shape;
        return command.pointId === null ? { ...geometry, ...position } : { ...geometry, centerPointId: command.pointId };
      }) });
    }
    case 'shape.bind-entity':
    case 'point.bind-entity': {
      const point = requireRecord(document.shapes, command.type === 'point.bind-entity' ? command.pointId : command.shapeId, 'Объект');
      if (['comment','text','value'].includes(point.kind)) throw new WorkspaceCommandError('Этот объект не представляет сущность.');
      if (command.entityId !== null && requireRecord(document.entities, command.entityId, 'Участник').folder) throw new WorkspaceCommandError('Папка не является участником.');
      return withChange(document, { shapes: document.shapes.map(shape => {
        if (shape.id !== point.id) return shape;
        const { entityId, ...geometry } = shape;
        return command.entityId === null ? geometry : { ...geometry, entityId: command.entityId };
      }) });
    }
    case 'object.link': {
      const entity=requireRecord(document.entities,command.entityId,'Участник');
      if(entity.folder)throw new WorkspaceCommandError('Выберите участника, а не папку.');
      let next=document;
      if(command.create)next=applyWorkspaceCommand(next,{type:'shape.add',id:command.shapeId,kind:command.create.kind,position:command.create.position});
      const shape=requireRecord(next.shapes,command.shapeId,'Объект');
      if(shape.entityId&&shape.entityId!==entity.id&&next.entities.some(e=>e.id===shape.entityId))throw new WorkspaceCommandError('Объект уже представляет другого участника. Сначала снимите связь в свойствах.');
      next=applyWorkspaceCommand(next,{type:'shape.bind-entity',shapeId:shape.id,entityId:entity.id});
      if(command.parameterId){const parameter=requireRecord(document.parameters,command.parameterId,'Параметр');if(parameter.ownerId!==entity.id)throw new WorkspaceCommandError('Выберите параметр этого участника.');next=applyWorkspaceCommand(next,{type:'reference.bind',referenceId:crypto.randomUUID(),target:{kind:'shape',id:shape.id,property:command.property},parameterId:parameter.id});}
      return {...next,revision:document.revision+1};
    }
    case 'entity.ungroup': {
      const group=requireRecord(document.entities,command.id,'Группа');
      if(!group.folder)throw new WorkspaceCommandError('Выберите папку участников.');
      return applyWorkspaceCommand(document,{type:'entity.remove',id:group.id});
    }
    case 'scene.rename': {
      requireRecord(document.sceneGroups,command.id,'Группа');if(!command.name.trim())throw new WorkspaceCommandError('Введите имя группы.');
      return withChange(document,{sceneGroups:document.sceneGroups.map(g=>g.id===command.id?{...g,name:command.name}:g)});
    }
    case 'entity.group': {
      requireUniqueId(document.entities,command.id,'Группа');
      if(!command.name.trim())throw new WorkspaceCommandError('Введите имя группы.');
      let next=applyWorkspaceCommand(document,{type:'entity.add',entity:{id:command.id,name:command.name,folder:true}});
      return applyWorkspaceCommand(next,{type:'entity.reparent',ids:command.ids,parentId:command.id});
    }
    case 'scene.wrap': {
      requireUniqueId(document.sceneGroups,command.id,'Группа');
      if(!command.name.trim())throw new WorkspaceCommandError('Введите имя группы.');
      const next={...document,sceneGroups:[...document.sceneGroups,{id:command.id,name:command.name,shapeIds:[]}]};
      return applyWorkspaceCommand(next,{type:'scene.organize',shapeIds:command.shapeIds,groupIds:command.groupIds,parentId:command.id});
    }
    case 'entity.visibility':
      requireRecord(document.entities,command.id,'Участник');
      return withChange(document,{entities:document.entities.map(e=>e.id===command.id?{...e,labelVisible:command.visible}:e)});
    case 'entity.reparent': {
      command.ids.forEach(id=>requireRecord(document.entities,id,'Участник'));
      if(command.parentId)requireRecord(document.entities,command.parentId,'Родитель');
      let parent=command.parentId;const seen=new Set<string>();
      while(parent){if(command.ids.includes(parent)||seen.has(parent))throw new WorkspaceCommandError('Нельзя вложить участника в себя или своего потомка.');seen.add(parent);parent=document.entities.find(e=>e.id===parent)?.parentId??null;}
      return withChange(document,{entities:document.entities.map(e=>command.ids.includes(e.id)?{...e,parentId:command.parentId??undefined}:e)});
    }
    case 'entity.remove': {
      const entity=document.entities.find(e=>e.id===command.id);if(!entity)return document;
      return withChange(document,{entities:document.entities.filter(e=>e.id!==command.id).map(e=>e.parentId===command.id?{...e,parentId:entity.parentId}:e),parameters:document.parameters.filter(p=>p.ownerId!==command.id)});
    }
    case 'scene.order': {
      if(command.parentId!==undefined)document=applyWorkspaceCommand(document,{type:'scene.organize',shapeIds:[command.id],groupIds:[],parentId:command.parentId});
      const shape=requireRecord(document.shapes,command.id,'Объект');
      if(command.beforeId===command.id)return document;
      const shapes=document.shapes.filter(s=>s.id!==command.id);
      const index=command.beforeId?shapes.findIndex(s=>s.id===command.beforeId):shapes.length;
      if(index<0)throw new WorkspaceCommandError('Слой назначения не найден.');shapes.splice(index,0,shape);
      return withChange(document,{shapes:normalizeLayerOrder({...document,shapes})});
    }
    case 'scene.organize': {
      if(document.recording)throw new WorkspaceCommandError('Завершите запись перед изменением групп.');
      command.shapeIds.forEach(id=>requireRecord(document.shapes,id,'Объект'));
      command.groupIds.forEach(id=>requireRecord(document.sceneGroups,id,'Группа'));
      if(command.parentId)requireRecord(document.sceneGroups,command.parentId,'Группа назначения');
      let parent=command.parentId;const seen=new Set<string>();
      while(parent){if(command.groupIds.includes(parent)||seen.has(parent))throw new WorkspaceCommandError('Нельзя вложить группу в себя или потомка.');seen.add(parent);parent=document.sceneGroups.find(g=>g.id===parent)?.parentId??null;}
      const sceneGroups=document.sceneGroups.map(g=>({...g,shapeIds:[...g.shapeIds.filter(id=>!command.shapeIds.includes(id)),...(g.id===command.parentId?command.shapeIds:[])],...(command.groupIds.includes(g.id)?{parentId:command.parentId??undefined}:{})}));
      return withChange(document,{sceneGroups,shapes:normalizeLayerOrder({...document,sceneGroups})});
    }
    case 'selection.remove': {
      if(document.recording)throw new WorkspaceCommandError('Завершите запись перед удалением.');
      const groups=new Set(command.groupIds);let size=-1;while(size!==groups.size){size=groups.size;document.sceneGroups.filter(g=>g.parentId&&groups.has(g.parentId)).forEach(g=>groups.add(g.id));}
      const shapes=new Set([...command.shapeIds,...document.sceneGroups.filter(g=>groups.has(g.id)).flatMap(g=>g.shapeIds)]);
      let next=document;
      for(const id of shapes)next=applyWorkspaceCommand(next,{type:'shape.remove',id});
      for(const id of command.entityIds)next=applyWorkspaceCommand(next,{type:'entity.remove',id});
      if(command.nodeIds.length)next=applyWorkspaceCommand(next,{type:'logic.remove',nodeIds:command.nodeIds});
      return withChange(document,{...next,sceneGroups:next.sceneGroups.filter(g=>!groups.has(g.id)),revision:document.revision+1});
    }
    case 'entity.create': {
      let next = applyWorkspaceCommand(document, {type:'entity.add',entity:command.entity});
      for (const parameter of command.parameters) {
        if (parameter.ownerId !== command.entity.id) throw new WorkspaceCommandError('Параметр должен принадлежать создаваемой сущности.');
        next = applyWorkspaceCommand(next, {type:'parameter.add',parameter});
      }
      return {...next, revision:document.revision+1};
    }
    case 'entity.add':
      if(command.entity.parentId)requireRecord(document.entities,command.entity.parentId,'Родитель');
      requireUniqueId(document.entities, command.entity.id, 'Сущность');
      return withChange(document, { entities: [...document.entities, command.entity] });
    case 'parameter.add': {
      requireUniqueId(document.parameters, command.parameter.id, 'Параметр');
      if(requireRecord(document.entities, command.parameter.ownerId, 'Владелец параметра').folder)throw new WorkspaceCommandError('Добавьте параметр участнику, а не папке.');
      if (!Number.isFinite(command.parameter.value)) throw new WorkspaceCommandError('Значение параметра должно быть конечным числом.');
      return withChange(document, { parameters: [...document.parameters, command.parameter] });
    }
    case 'parameter.update': {
      const parameter = requireRecord(document.parameters, command.id, 'Параметр');
      if (parameter.sourceNodeId && command.update.value !== undefined) throw new WorkspaceCommandError('Значение задаётся схемой. Измените источник или снимите присвоение.');
      if (command.update.value !== undefined && !Number.isFinite(command.update.value)) {
        throw new WorkspaceCommandError('Значение параметра должно быть конечным числом.');
      }
      return withChange(document, {
        parameters: document.parameters.map(parameter => parameter.id === command.id ? { ...parameter, ...command.update } : parameter),
      });
    }
    case 'parameters.batch-update': {
      const parameters=command.ids.map(id=>requireRecord(document.parameters,id,'Параметр'));
      if(parameters.length<2||new Set(command.ids).size!==parameters.length||new Set(parameters.map(p=>p.ownerId)).size!==parameters.length||parameters.some(p=>parameterSignature(document,p)!==parameterSignature(document,parameters[0]))) throw new WorkspaceCommandError('Параметры больше не совпадают. Выберите их заново.');
      const name=command.name.trim(), {min,max,step}=command.controls;
      if(!name||[min,max,step,command.value].some(v=>v!==undefined&&!Number.isFinite(v))||(step!==undefined&&step<=0)||(min!==undefined&&max!==undefined&&min>max))throw new WorkspaceCommandError('Проверьте имя, значение и границы параметров.');
      if(command.value!==undefined&&parameters.some(p=>p.sourceNodeId))throw new WorkspaceCommandError('Значение задаётся формулой. Измените источник.');
      if(command.expression!==undefined&&(!command.expression.trim()||!canEditCommonFormula(document,command.ids)))throw new WorkspaceCommandError('Формула используется вне выделенных параметров или недоступна для изменения.');
      const ids=new Set(command.ids);
      const sourceIds=new Set(parameters.map(p=>p.sourceNodeId).filter((id):id is string=>Boolean(id)));
      return withChange(document,{parameters:document.parameters.map(p=>ids.has(p.id)?{...p,name,controls:{...command.controls},...(command.value===undefined?{}:{value:command.value})}:p),...(command.expression===undefined?{}:{logic:{...document.logic,nodes:document.logic.nodes.map(n=>sourceIds.has(n.id)&&n.data.calculation?{...n,data:{...n.data,calculation:{...n.data.calculation,expression:command.expression!}}}:n)}})});
    }
    case 'parameter.controls': {
      requireRecord(document.parameters, command.id, 'Параметр');
      const { min, max, step } = command.controls;
      if ([min, max, step].some(value => value !== undefined && !Number.isFinite(value)) || (step !== undefined && step <= 0) || (min !== undefined && max !== undefined && min > max)) throw new WorkspaceCommandError('Укажите корректные границы и положительный шаг.');
      return withChange(document, { parameters: document.parameters.map(item => item.id === command.id ? { ...item, controls: { ...command.controls } } : item) });
    }
    case 'parameter.assign': {
      const parameter = requireRecord(document.parameters, command.id, 'Параметр');
      if (command.sourceNodeId !== null) {
        const node = requireRecord(document.logic.nodes, command.sourceNodeId, 'Источник');
        if (node.data.role !== 'calculate' && node.data.role !== 'variable' && node.data.role !== 'spatial' && node.data.role !== 'condition') throw new WorkspaceCommandError('Выберите вычисляемый источник.');
      }
      const current = readParameterValue(document, parameter.id);
      return withChange(document, { parameters: document.parameters.map(item => {
        if (item.id !== parameter.id) return item;
        const { sourceNodeId, ...literal } = item;
        return command.sourceNodeId === null
          ? { ...literal, value: current.status === 'ready' && typeof current.value === 'number' ? current.value : item.value }
          : { ...item, sourceNodeId: command.sourceNodeId };
      }) });
    }
    case 'calculation.update': {
      const node = requireRecord(document.logic.nodes, command.nodeId, 'Блок');
      if (!['calculate','condition','action','repeat'].includes(node.data.role)) throw new WorkspaceCommandError('Выберите блок вычисления.');
      const ids = new Set(command.calculation.inputs.map(input => input.id));
      if (ids.size !== command.calculation.inputs.length || [...ids].some(id => !id || id === 'value' || id === 'exec')) throw new WorkspaceCommandError('Входам нужны уникальные непустые ID.');
      return withChange(document, { logic: { ...document.logic,
        edges: document.logic.edges.filter(edge => edge.target !== node.id || edge.targetHandle === 'exec' || ids.has(edge.targetHandle ?? '')),
        nodes: document.logic.nodes.map(item => item.id === node.id ? { ...item, data: { ...item.data, calculation: command.calculation } } : item),
      } });
    }
    case 'variable.update': {
      const node = requireRecord(document.logic.nodes, command.nodeId, 'Переменная');
      if (node.data.role !== 'variable' || !Number.isFinite(command.value)) throw new WorkspaceCommandError('Выберите переменную и конечное число.');
      return withChange(document, { logic: { ...document.logic, nodes: document.logic.nodes.map(item => item.id === node.id ? { ...item, data: { ...item.data, variableValue: command.value } } : item) } });
    }
    case 'parameter.remove': {
      if (!document.parameters.some(parameter => parameter.id === command.id)) return document;
      return withChange(document, { parameters: document.parameters.filter(parameter => parameter.id !== command.id) });
    }
    case 'reference.bind': {
      requireRecord(document.parameters, command.parameterId, 'Параметр');
      if (command.target.kind === 'shape') {
        const shape = requireRecord(document.shapes, command.target.id, 'Фигура');
        const property=command.target.property??'radius';
        if(!shapeProperties(shape.kind).includes(property))throw new WorkspaceCommandError('Это свойство недоступно у выбранной фигуры.');
      } else {
        const node = requireRecord(document.logic.nodes, command.target.id, 'Блок');
        if (node.data.role !== 'read') throw new WorkspaceCommandError('Выберите блок чтения параметров.');
      }
      const existing = readTargetParameter(document, command.target);
      if (existing.status !== 'unbound') {
        return withChange(document, { references: document.references.map(reference => reference.id === existing.reference.id ? { ...reference, parameterId: command.parameterId } : reference) });
      }
      requireUniqueId(document.references, command.referenceId, 'Ссылка');
      return withChange(document, { references: [...document.references, { id: command.referenceId, target: command.target, parameterId: command.parameterId }] });
    }
    case 'reference.remove': {
      const reference = document.references.find(item => item.id === command.id);
      if (!reference) return document;
      const shape = reference.target.kind === 'shape' ? document.shapes.find(item => item.id === reference.target.id) : undefined;
      const reading=readTargetParameter(document,reference.target);
      const property=reference.target.property??'radius';
      const radius = reading.status==='resolved'?reading.parameter.value:shape?geometryValue(shape,property):null;
      return withChange(document, {
        references: document.references.filter(item => item.id !== command.id),
        shapes: shape && radius !== null ? document.shapes.map(item => item.id === shape.id ? { ...item, [property]:radius } : item) : document.shapes,
      });
    }
    case 'reference.add': {
      requireUniqueId(document.references, command.reference.id, 'Ссылка');
      requireRecord(document.parameters, command.reference.parameterId, 'Параметр');
      if (command.reference.target.kind === 'shape') requireRecord(document.shapes, command.reference.target.id, 'Визуальный объект');
      else requireRecord(document.logic.nodes, command.reference.target.id, 'Блок схемы');
      return withChange(document, { references: [...document.references, command.reference] });
    }
  }
}

export function getReferenceStatus(document: WorkspaceDocument, reference: ParameterReference): 'resolved' | 'missing' {
  const parameterExists = document.parameters.some(parameter => parameter.id === reference.parameterId);
  const targetExists = reference.target.kind === 'shape'
    ? document.shapes.some(shape => shape.id === reference.target.id)
    : document.logic.nodes.some(node => node.id === reference.target.id);
  return parameterExists && targetExists ? 'resolved' : 'missing';
}

export function addShape(document: WorkspaceDocument, kind: ShapeKind, id: string, position: { x: number; y: number }): WorkspaceDocument {
  return applyWorkspaceCommand(document, { type: 'shape.add', kind, id, position });
}

export function updateShape(document: WorkspaceDocument, id: string, update: Partial<Omit<SceneShape, 'id' | 'kind' | 'entityId' | 'centerPointId'>>): WorkspaceDocument {
  if (!document.shapes.some(shape => shape.id === id)) return document;
  return applyWorkspaceCommand(document, { type: 'shape.update', id, update });
}

export function removeShape(document: WorkspaceDocument, id: string): WorkspaceDocument {
  return applyWorkspaceCommand(document, { type: 'shape.remove', id });
}
