import {graphPorts} from '../engine/node-graph.ts';
import type { LogicNode, LogicEdge, WorkspaceDocument, SceneShape, WorkspaceParameter } from './document.ts';

type Logic = WorkspaceDocument['logic'];
export interface GroupPort { id: string; nodeId: string; handle: string; label: string }
export function descendants(logic: Logic, ids: string[]): Set<string> {
  const result = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of logic.nodes) if (node.parentId && result.has(node.parentId) && !result.has(node.id)) { result.add(node.id); changed = true; }
  }
  return result;
}
export function validateHierarchy(logic: Logic) {
  const nodes = new Map(logic.nodes.map(node => [node.id, node]));
  if (nodes.size !== logic.nodes.length) throw new Error('В схеме повторяются ID блоков.');
  for (const node of logic.nodes) {
    if (!node.id || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) throw new Error('Блоку нужны ID и конечные координаты.');
    const visited = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId) {
      const parent = nodes.get(parentId);
      if (!parent || parent.data.role !== 'group') throw new Error('Родитель блока должен быть существующим составным блоком.');
      if (visited.has(parentId)) throw new Error('Вложенность блоков не должна образовывать цикл.');
      visited.add(parentId); parentId = parent.parentId;
    }
  }
}
export function orderedContextParameters(node:LogicNode, parameters:WorkspaceParameter[], entityId:string):WorkspaceParameter[] {
  const relevant=parameters.filter(p=>p.ownerId===entityId);const order=node.data.contextParameterOrder??[];
  return relevant.slice().sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?Number.MAX_SAFE_INTEGER:ai)-(bi<0?Number.MAX_SAFE_INTEGER:bi);});
}
export function executionOutputs(node: LogicNode): string[] {
  if(node.data.graph)return graphPorts(node.data.graph).outputs.filter(p=>p.type==='exec').map(p=>p.id);
  return node.data.role === 'condition' ? ['true','false'] : node.data.role === 'repeat' ? ['body','then'] : ['event','action'].includes(node.data.role) ? ['then'] : [];
}
export function hasValueOutput(node: LogicNode): boolean { if(node.data.graph)return graphPorts(node.data.graph).outputs.some(p=>p.id==='value');return ['read','calculate','variable','condition','spatial'].includes(node.data.role); }
export function groupPorts(logic: Logic, groupId: string, includeHidden = false, parameters:WorkspaceParameter[] = [], shapes:SceneShape[] = []): { inputs: GroupPort[]; outputs: GroupPort[] } {
  const inside = descendants(logic,[groupId]), inputs: GroupPort[] = [], outputs: GroupPort[] = [];
  for (const node of logic.nodes) {
    if (node.id === groupId || !inside.has(node.id) || node.data.role === 'group') continue;
    if(node.data.graph){const ports=graphPorts(node.data.graph);for(const p of ports.inputs)if(!logic.edges.some(e=>e.target===node.id&&e.targetHandle===p.id&&inside.has(e.source)))inputs.push({id:`in:${node.id}:${p.id}`,nodeId:node.id,handle:p.id,label:p.label});for(const p of ports.outputs)outputs.push({id:`out:${node.id}:${p.id}`,nodeId:node.id,handle:p.id,label:p.label});continue;}
    if(node.data.role==='event')for(const parameter of parameters.filter(p=>p.ownerId===node.data.event?.contextEntityId))outputs.push({id:`out:${node.id}:parameter:${parameter.id}`,nodeId:node.id,handle:`parameter:${parameter.id}`,label:`${parameter.name} · при событии`});
    if(node.data.role==='context') for(const parameter of (node.data.contextEntityIds??[]).flatMap(id=>orderedContextParameters(node,parameters,id))) outputs.push({id:`out:${node.id}:parameter:${parameter.id}`,nodeId:node.id,handle:`parameter:${parameter.id}`,label:parameter.name});
    if(node.data.role==='context') for(const shape of shapes.filter(s=>s.entityId&&node.data.contextEntityIds?.includes(s.entityId))) outputs.push({id:`out:${node.id}:shape:${shape.id}`,nodeId:node.id,handle:`shape:${shape.id}`,label:shape.name});
    if (hasValueOutput(node)) outputs.push({id:`out:${node.id}`,nodeId:node.id,handle:'value',label:node.data.label});
    for (const handle of executionOutputs(node)) {
      if (!logic.edges.some(e=>e.source===node.id && e.sourceHandle===handle && inside.has(e.target))) outputs.push({id:`out:${node.id}:${handle}`,nodeId:node.id,handle,label:`${node.data.label} / ${handle}`});
    }
    if (['condition','action','repeat'].includes(node.data.role) && !logic.edges.some(e=>e.target===node.id && e.targetHandle==='exec' && inside.has(e.source))) inputs.push({id:`in:${node.id}:exec`,nodeId:node.id,handle:'exec',label:`${node.data.label} / выполнить`});
    if(node.data.role==='spatial') for(const handle of ['origin','target']) if(!logic.edges.some(e=>e.target===node.id&&e.targetHandle===handle&&inside.has(e.source))) inputs.push({id:`in:${node.id}:${handle}`,nodeId:node.id,handle,label:`${node.data.label} / ${handle==='origin'?'объект':'цель'}`});
    if(node.data.role==='event') for(const handle of ['point','zone']) if(!logic.edges.some(e=>e.target===node.id&&e.targetHandle===handle&&inside.has(e.source))) inputs.push({id:`in:${node.id}:${handle}`,nodeId:node.id,handle,label:`${node.data.label} / ${handle==='point'?'точка':'область'}`});
    for (const input of node.data.calculation?.inputs ?? []) {
      if (!logic.edges.some(e=>e.target===node.id && e.targetHandle===input.id && inside.has(e.source))) inputs.push({id:`in:${node.id}:${input.id}`,nodeId:node.id,handle:input.id,label:`${node.data.label} / ${input.alias}`});
    }
  }
  const group = logic.nodes.find(n=>n.id===groupId);
  const exposed = (port: GroupPort) => {
    let parent = logic.nodes.find(n=>n.id===port.nodeId)?.parentId;
    while (parent && parent !== groupId) {
      const ancestor = logic.nodes.find(n=>n.id===parent);
      if (ancestor?.data.exposedPorts && !ancestor.data.exposedPorts.includes(port.id)) return false;
      parent = ancestor?.parentId;
    }
    return includeHidden || !group?.data.exposedPorts || group.data.exposedPorts.includes(port.id);
  };
  return { inputs:inputs.filter(exposed), outputs:outputs.filter(exposed) };
}

export function projectLogic(logic: Logic, parentId?: string): Logic {
  const nodes = logic.nodes.filter(node => node.parentId === parentId);
  const visible = new Set(nodes.map(node => node.id));
  function representative(id: string): string | undefined {
    let node = logic.nodes.find(node => node.id === id);
    while (node && !visible.has(node.id)) node = logic.nodes.find(item => item.id === node!.parentId);
    return node?.id;
  }
  const edges: LogicEdge[] = [];
  for (const edge of logic.edges) {
    const source = representative(edge.source), target = representative(edge.target);
    if (!source || !target || (source === target && (source !== edge.source || target !== edge.target))) continue;
    edges.push({ ...edge, source, target,
      sourceHandle: source === edge.source ? edge.sourceHandle : logic.nodes.find(n=>n.id===edge.source)?.data.graph?`out:${edge.source}:${edge.sourceHandle}`:`out:${edge.source}${edge.sourceHandle === 'value' ? '' : ':'+edge.sourceHandle}`,
      targetHandle: target === edge.target ? edge.targetHandle : `in:${edge.target}:${edge.targetHandle}`,
    });
  }
  return { nodes, edges };
}
export function resolveGroupPort(logic: Logic, nodeId: string, handle: string | null | undefined, direction: 'inputs' | 'outputs', parameters:WorkspaceParameter[] = [], shapes:SceneShape[] = []) {
  const node = logic.nodes.find(item => item.id === nodeId);
  if (node?.data.role !== 'group') return { nodeId, handle };
  const port = groupPorts(logic, nodeId, false, parameters, shapes)[direction].find(item => item.id === handle);
  if (!port) throw new Error('Порт составного блока недоступен. Проверьте внутреннюю схему.');
  return { nodeId: port.nodeId, handle: port.handle };
}
export function groupNodes(logic: Logic, id: string, nodeIds: string[], name: string): Logic {
  if (logic.nodes.some(n => n.id === id) || !id) throw new Error('Нужен новый ID составного блока.');
  const selected = logic.nodes.filter(node => nodeIds.includes(node.id));
  if (!name.trim() || !selected.length || selected.length !== new Set(nodeIds).size) throw new Error('Выберите существующие блоки и непустое название.');
  const parentId = selected[0]!.parentId;
  if (selected.some(node => node.parentId !== parentId)) throw new Error('Выберите блоки одного уровня вложенности.');
  const group: LogicNode = { id, type: 'draft', ...(parentId ? { parentId } : {}), position: { x: Math.min(...selected.map(n => n.position.x)), y: Math.min(...selected.map(n => n.position.y)) }, data: { role: 'group', label: name.trim() } };
  return { ...logic, nodes: [...logic.nodes.map(node => nodeIds.includes(node.id) ? { ...node, parentId: id } : node), group] };
}
export function ungroupNodes(logic: Logic, id: string): Logic {
  const group = logic.nodes.find(n => n.id === id);
  if (group?.data.role !== 'group') throw new Error('Выберите составной блок.');
  return { ...logic, nodes: logic.nodes.filter(n => n.id !== id).map(node => {
    if (node.parentId !== id) return node;
    const { parentId: removed, ...rest } = node;
    return { ...rest, ...(group.parentId ? { parentId: group.parentId } : {}) };
  }) };
}
export function duplicateNodes(document: WorkspaceDocument, nodeIds: string[], copyId: string) {
  if (!copyId || !nodeIds.length || nodeIds.some(id => !document.logic.nodes.some(n => n.id === id))) throw new Error('Выберите существующие блоки для копирования.');
  const ids = descendants(document.logic, nodeIds);
  const roots = document.logic.nodes.filter(n => ids.has(n.id) && !ids.has(n.parentId ?? ''));
  if (roots.some(n => n.parentId !== roots[0]?.parentId)) throw new Error('Копируйте блоки одного уровня.');
  const mapId = (id: string) => `${copyId}:${id}`;
  const offsetX = Math.max(...roots.map(n => n.position.x)) - Math.min(...roots.map(n => n.position.x)) + 380;
  const newNodes = document.logic.nodes.filter(n => ids.has(n.id)).map(n => ({ ...structuredClone(n), id: mapId(n.id),
    ...(n.parentId && ids.has(n.parentId) ? { parentId: mapId(n.parentId) } : {}),
    position: { x: n.position.x + (roots.some(root => root.id === n.id) ? offsetX : 0), y: n.position.y + (roots.some(root => root.id === n.id) ? 32 : 0) },
  }));
  for (const node of newNodes) {
    if(node.data.graph?.referenceId&&ids.has(node.data.graph.referenceId))node.data.graph.referenceId=mapId(node.data.graph.referenceId);
    if(node.data.action?.operation==='emit'&&ids.has(node.data.action.targetId))node.data.action.targetId=mapId(node.data.action.targetId);
    if (node.data.exposedPorts) node.data.exposedPorts = node.data.exposedPorts.map(port => {
      for (const id of ids) {
        if (port === `out:${id}` || port.startsWith(`out:${id}:`)) return `out:${mapId(id)}${port.slice(`out:${id}`.length)}`;
        if (port.startsWith(`in:${id}:`)) return `in:${mapId(id)}:${port.slice(`in:${id}:`.length)}`;
      }
      return port;
    });
  }
  const newEdges = document.logic.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ ...e, id: mapId(e.id), source: mapId(e.source), target: mapId(e.target) }));
  const references = document.references.filter(ref => ref.target.kind === 'logic-node' && ids.has(ref.target.id)).map(ref => ({ ...ref, id: mapId(ref.id), target: { ...ref.target, id: mapId(ref.target.id) } }));
  for (const [existing, added] of [[document.logic.nodes, newNodes], [document.logic.edges, newEdges], [document.references, references]] as const) {
    const all = [...existing, ...added];
    if (new Set(all.map(item => item.id)).size !== all.length) throw new Error('ID копии уже используется. Повторите копирование.');
  }
  const logic = { nodes: [...document.logic.nodes, ...newNodes], edges: [...document.logic.edges, ...newEdges] };
  validateHierarchy(logic);
  return { logic, references: [...document.references, ...references] };
}
export function moveSceneGroup(document: WorkspaceDocument, shapeId: string, x?: number, y?: number): SceneShape[] | null {
  let group = document.sceneGroups.find(g => g.shapeIds.includes(shapeId));
  while(group?.parentId){const parent=document.sceneGroups.find(g=>g.id===group!.parentId);if(!parent)break;group=parent;}
  if (!group || (x === undefined && y === undefined)) return null;
  const anchor = (id: string) => {
    const shape = document.shapes.find(s => s.id === id);
    if (!shape) throw new Error('Объект группы удалён. Исправьте состав группы.');
    const owner = shape.centerPointId ? document.shapes.find(s => s.id === shape.centerPointId) : shape;
    if (!owner) throw new Error('Центр круга удалён. Выберите существующий центр.');
    return owner;
  };
  const origin = anchor(shapeId), dx = x === undefined ? 0 : x - origin.x, dy = y === undefined ? 0 : y - origin.y;
  const groups=new Set([group.id]);let size=-1;while(size!==groups.size){size=groups.size;document.sceneGroups.filter(g=>g.parentId&&groups.has(g.parentId)).forEach(g=>groups.add(g.id));}
  const owners = new Set(document.sceneGroups.filter(g=>groups.has(g.id)).flatMap(g=>g.shapeIds).map(id => anchor(id).id));
  const shapes = document.shapes.map(shape => owners.has(shape.id) ? { ...shape, x: shape.x + dx, y: shape.y + dy } : shape);
  if (shapes.some(shape => !Number.isFinite(shape.x) || !Number.isFinite(shape.y))) throw new Error('Координаты группы должны оставаться конечными числами.');
  return shapes;
}
