import {GraphNode,GraphPalette,portColors} from './GraphNode.tsx';
import {graphLabels,graphPorts} from '../engine/node-graph.ts';
import type {GraphOperation} from '../engine/node-graph.ts';
import {spatialLabels} from '../engine/spatial.ts';
import { exportLogicYaml } from '../workspace/yaml-transfer.ts';
import { TextField } from './TextField.tsx';
import { createPortal } from 'react-dom';
import { BehaviorEditor, GroupPortEditor, roleLabels, roleIcons } from './BehaviorEditor.tsx';
import { logicConnectionKind } from '../workspace/document.ts';
import { useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, Handle, Position, applyEdgeChanges, applyNodeChanges, useUpdateNodeInternals,
} from '@xyflow/react';
import type { Node, NodeProps, Connection, Edge, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CalculationEditor, AssignmentPicker } from './CalculationEditor.tsx';
import { Icon, IconButton } from './Icon.tsx';
import { NumericField } from './NumericField.tsx';
import { InlineName } from './EntityTreeEditor.tsx';
import { sourceKey } from '../engine/calculations.ts';
import { ParameterPicker } from './ParameterPicker.tsx';
import { readTargetParameter } from '../workspace/bindings.ts';
import { groupPorts, projectLogic, resolveGroupPort, executionOutputs, hasValueOutput, descendants, orderedContextParameters } from '../workspace/composition.ts';
import type { WorkspaceDocument, WorkspaceCommand, LogicEdge, LogicNode } from '../workspace/document.ts';

type DraftData = LogicNode['data'] & { document?: WorkspaceDocument; targetId?: string; onCommand?: (command: WorkspaceCommand) => void; onOpen?: (id: string) => void; onSelectShape?: (id: string) => void; checking?:boolean; selected?: boolean; onToggle?: (id: string) => void };
type DraftNode = Node<DraftData, 'draft'>;
function DraftBlock({ data }: NodeProps<DraftNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const ports = data.document && data.targetId && data.role === 'group' ? groupPorts(data.document.logic, data.targetId, false, data.document.parameters, data.document.shapes) : undefined;
  const portSignature = JSON.stringify([ports ?? data.calculation?.inputs.map(input => input.id),data.event?.contextEntityId,data.document?.parameters.map(p=>[p.id,p.ownerId]),data.document?.entities.map(e=>e.id),data.document?.shapes.map(s=>[s.id,s.entityId])]);
  useEffect(() => { if (data.targetId) updateNodeInternals(data.targetId); }, [data.targetId, portSignature, updateNodeInternals]);
  const modelNode = data.document?.logic.nodes.find(node => node.id === data.targetId);
  const headingLabel=data.role==='spatial'&&modelNode?.data.spatial&&Object.values(spatialLabels).some(label=>label===data.label)?spatialLabels[modelNode.data.spatial.operation]:data.label;
  const result = data.document && data.targetId ? data.document.evaluations[sourceKey({ kind: 'node', id: data.targetId })] : undefined;
  const reading = data.document && data.targetId ? readTargetParameter(data.document, { kind: 'logic-node', id: data.targetId }) : undefined;
  const portClass=(handle:string,direction:'source'|'target')=>data.document?.logic.edges.some(edge=>direction==='source'?edge.source===data.targetId&&edge.sourceHandle===handle:edge.target===data.targetId&&edge.targetHandle===handle)?'port-connected':'port-free';
  if(modelNode?.data.graph&&data.document&&data.onCommand)return <GraphNode node={modelNode} document={data.document} onCommand={data.onCommand} checking={data.checking}/>;
  return <div className={`logic-node ${data.role}`}>
    <div className="node-heading"><Icon name={roleIcons[data.role]}/>{modelNode&&data.onCommand?<span className="nodrag nopan node-title" onDoubleClick={event=>event.stopPropagation()}><InlineName value={headingLabel} label="Название блока" onChange={name=>data.onCommand?.({type:'logic.rename',id:modelNode.id,name})}/></span>:headingLabel}{data.role==='group'&&modelNode&&<button className="node-open nodrag nopan" aria-label="Открыть блок" title="Открыть блок" onClick={event=>{event.stopPropagation();data.onOpen?.(modelNode.id);}}><Icon name="folder"/></button>}</div>
    {data.role==='note' && modelNode && data.onCommand && <div className="node-reading nodrag nopan"><button aria-label={modelNode.data.noteCollapsed?'Развернуть комментарий':'Свернуть комментарий'} onClick={()=>data.onCommand?.({type:'note.update',id:modelNode.id,collapsed:!modelNode.data.noteCollapsed})}>{modelNode.data.noteCollapsed?'Развернуть':'Свернуть'}</button>{!modelNode.data.noteCollapsed&&<TextField label="Комментарий" value={modelNode.data.note??''} multiline allowEmpty onChange={text=>data.onCommand?.({type:'note.update',id:modelNode.id,text})}/>}</div>}
    {data.role === 'group' && modelNode && data.onCommand && <div className="node-reading nodrag nopan">
      {data.document && [...descendants(data.document.logic,[modelNode.id])].filter(id=>data.document!.behavior.results[id]?.status==='error').map(id=><p role="alert" className="binding-error" key={id}>{data.document!.logic.nodes.find(n=>n.id===id)?.data.label}: {data.document!.behavior.results[id]!.message}</p>)}
      {data.document && <GroupPortEditor node={modelNode} document={data.document} onCommand={data.onCommand}/>}
    </div>}
    {ports?.inputs.map(port => <div className="pin-row" key={port.id}><Handle id={port.id} type="target" position={Position.Left} aria-label={`Вход ${port.label}`} /><span>{port.label}</span></div>)}
    {ports?.outputs.map(port => {
      const value = data.document?.evaluations[sourceKey({ kind: 'node', id: port.nodeId })];
      return <div className="pin-row output" key={port.id}><span>{port.label}
        {port.handle === 'value' && value?.status === 'ready' && <output aria-label={`Результат выхода ${port.label}`}>{Array.isArray(value.value) ? `[${value.value.slice(0, 30).join(', ')}${value.value.length > 30 ? ', …' : ''}]` : String(value.value)}</output>}
        {port.handle === 'value' && value?.status === 'error' && <small role="alert" className="binding-error">{value.message}</small>}
      </span><Handle id={port.id} type="source" position={Position.Right} aria-label={`Выход ${port.label}`} /></div>;
    })}
    {data.role==='context' && data.document && modelNode && <div className="context-groups nodrag nopan">{(modelNode.data.contextEntityIds??[]).map(id=><ContextGroup key={id} id={id} node={modelNode} document={data.document!} onCommand={data.onCommand}/>)}<details className="context-add"><summary>Добавить сущность</summary><label className="field"><select aria-label="Добавить сущность" value="" onChange={e=>{if(e.target.value)data.onCommand?.({type:'context.members',id:modelNode.id,entityIds:[...(modelNode.data.contextEntityIds??[]),e.target.value]});}}><option value="">Выберите</option>{data.document.entities.filter(e=>!e.folder&&!modelNode.data.contextEntityIds?.includes(e.id)).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label></details></div>}
    {data.role === 'read' && data.document && data.targetId && data.onCommand && <div className="node-reading">
      <ParameterPicker document={data.document} target={{ kind: 'logic-node', id: data.targetId }} label="Источник блока" onCommand={data.onCommand} />
      {reading?.status === 'resolved' && <output aria-label="Прочитанное значение">{reading.parameter.name}: {reading.parameter.value}</output>}
    </div>}
    {(data.role === 'calculate' || data.role === 'variable') && data.document && data.targetId && data.onCommand && modelNode && <div className="node-reading">
      {data.role === 'calculate' ? <CalculationEditor node={modelNode} document={data.document} onCommand={data.onCommand} />
        : <div className="nodrag nopan"><NumericField label="Значение переменной" value={data.variableValue ?? 0} onChange={value => data.onCommand!({ type: 'variable.update', nodeId: data.targetId!, value })} /></div>}
      {result?.status === 'ready' && <output aria-label="Результат вычисления">{Array.isArray(result.value) ? `[${result.value.slice(0, 30).join(', ')}${result.value.length > 30 ? ', …' : ''}]` : String(result.value)}</output>}
      {result?.status === 'error' && <p role="alert" className="binding-error">{result.message}</p>}
      <AssignmentPicker nodeId={data.targetId} document={data.document} onCommand={data.onCommand} />
    </div>}
    {['event','condition','action','repeat','spatial'].includes(data.role) && modelNode && data.document && data.onCommand && <BehaviorEditor node={modelNode} document={data.document} onCommand={data.onCommand} onSelectShape={data.onSelectShape} checking={data.checking}/>}
    {data.role==='event'&&data.document?.parameters.filter(parameter=>parameter.ownerId===modelNode?.data.event?.contextEntityId).map(parameter=><div className="pin-row output" key={parameter.id}><span>{parameter.name} · при событии</span><Handle id={`parameter:${parameter.id}`} type="source" position={Position.Right} aria-label={`Данные события: ${parameter.name}`}/></div>)}
    {data.role==='event' && ['enter','inside','leave'].includes(modelNode?.data.event?.trigger??'manual') && ['point','zone'].map(handle=><div className="pin-row" key={handle}><Handle className={portClass(handle,'target')} id={handle} type="target" position={Position.Left} aria-label={handle==='point'?'Вход точки':'Вход области'}/><span>{handle==='point'?'Точка':'Область'}</span>{data.document?.logic.edges.filter(e=>e.target===data.targetId&&e.targetHandle===handle).map(e=><button className="nodrag nopan" key={e.id} aria-label={`Отключить ${handle==='point'?'точку':'область'}`} onClick={()=>data.onCommand?.({type:'logic.disconnect',edgeId:e.id})}>×</button>)}</div>)}
    {data.role==='spatial' && ['origin','target'].map(handle=><div className="pin-row" key={handle}><Handle className={portClass(handle,'target')} id={handle} type="target" position={Position.Left} aria-label={handle==='origin'?'Вход объекта':'Вход цели'}/><span>{handle==='origin'?'Объект':'Цель'}</span>{data.document?.logic.edges.filter(e=>e.target===data.targetId&&e.targetHandle===handle).map(e=><button className="nodrag nopan" key={e.id} aria-label={`Отключить ${handle==='origin'?'объект':'цель'}`} onClick={()=>data.onCommand?.({type:'logic.disconnect',edgeId:e.id})}>×</button>)}</div>)}
    {['condition','action','repeat'].includes(data.role) && <div className="pin-row execution"><Handle className={portClass('exec','target')} id="exec" type="target" position={Position.Left} aria-label="Вход выполнения"/><span>Выполнить</span></div>}
    {modelNode && executionOutputs(modelNode).map(handle=><div className="pin-row output execution" key={handle}><span>{ {then:data.role==='event'?'Реакции':'Далее',true:'Да',false:'Нет',body:'Тело'}[handle] }</span><Handle className={portClass(handle,'source')} id={handle} type="source" position={Position.Right} aria-label={`Выход выполнения ${handle}`}/></div>)}
    {reading?.status === 'missing' && <p role="alert" className="binding-error">Параметр удалён. Выберите замену.</p>}
    {reading?.status === 'error' && <p role="alert" className="binding-error">{reading.message}</p>}
    {['calculate','condition','action','repeat'].includes(data.role) && data.calculation?.inputs.map((input,index) => <div className="pin-row" key={input.id}>
      <Handle className={portClass(input.id,'target')} id={input.id} type="target" position={Position.Left} aria-label={`Вход ${index+1}, имя в формуле ${input.alias}`} /><span>Вход {index+1} <code>{input.alias}</code></span>
      {data.document?.logic.edges.filter(edge => edge.target === data.targetId && edge.targetHandle === input.id).map(edge => <button className="nodrag nopan" key={edge.id} aria-label={`Отключить вход ${input.alias}`} onClick={() => data.onCommand?.({ type: 'logic.disconnect', edgeId: edge.id })}>×</button>)}
    </div>)}
    {modelNode && hasValueOutput(modelNode) && <div className="pin-row output"><span>Значение</span><Handle className={portClass('value','source')} id="value" type="source" position={Position.Right} aria-label="Выход значения" /></div>}
  </div>;
}
function ContextGroup({id,node,document,onCommand}:{id:string;node:LogicNode;document:WorkspaceDocument;onCommand?: (command:WorkspaceCommand)=>void}) {
 const [expanded,setExpanded]=useState(true);const update=useUpdateNodeInternals();const entity=document.entities.find(e=>e.id===id);const parameters=orderedContextParameters(node,document.parameters,id);
 const orderSignature=JSON.stringify([parameters.map(p=>p.id),document.shapes.filter(s=>s.entityId===id).map(s=>s.id)]);
 useEffect(()=>{update(node.id);},[expanded,orderSignature,node.id,update]);
 const port=(parameter:typeof parameters[number])=><Handle key={parameter.id} className={document.logic.edges.some(edge=>edge.source===node.id&&edge.sourceHandle===`parameter:${parameter.id}`)?'port-connected':'port-free'} type="source" position={Position.Right} id={`parameter:${parameter.id}`} aria-label={`Выход ${parameter.name}`}/>;
 const shapes=document.shapes.filter(shape=>shape.entityId===id);
 const shapePort=(shape:typeof shapes[number])=><Handle key={`shape:${shape.id}`} className={document.logic.edges.some(edge=>edge.source===node.id&&edge.sourceHandle===`shape:${shape.id}`)?'port-connected':'port-free'} type="source" position={Position.Right} id={`shape:${shape.id}`} aria-label={`Выход объекта ${shape.name}`}/>;
 return <div className="context-group"><div className="context-group-heading"><button className="context-disclosure" aria-expanded={expanded} aria-label={`${expanded?'Свернуть':'Развернуть'}: ${entity?.name??id}`} onClick={()=>setExpanded(!expanded)}>{expanded?'⌄':'›'} {entity?.name??'Сущность удалена'}</button><button aria-label={`Выше: ${entity?.name??id}`} onClick={()=>{const ids=[...(node.data.contextEntityIds??[])],i=ids.indexOf(id);if(i>0){[ids[i-1],ids[i]]=[ids[i],ids[i-1]];onCommand?.({type:'context.members',id:node.id,entityIds:ids});}}}>↑</button><button aria-label={`Убрать: ${entity?.name??id}`} onClick={()=>onCommand?.({type:'context.members',id:node.id,entityIds:(node.data.contextEntityIds??[]).filter(v=>v!==id)})}>×</button></div>{expanded&&shapes.map(shape=><div className="pin-row output" key={`shape-row:${shape.id}`}><span>◈ {shape.name}</span>{shapePort(shape)}</div>)}{expanded?parameters.map(parameter=><div className="pin-row output" key={parameter.id} onDragOver={event=>{if(event.dataTransfer.types.includes("application/x-vigc-context-parameter"))event.preventDefault();}} onDrop={event=>{event.preventDefault();event.stopPropagation();let item:{nodeId:string;entityId:string;parameterId:string};try{item=JSON.parse(event.dataTransfer.getData("application/x-vigc-context-parameter"));}catch{return;}if(item.nodeId!==node.id||item.entityId!==id||item.parameterId===parameter.id)return;const ids=parameters.map(p=>p.id),from=ids.indexOf(item.parameterId),to=ids.indexOf(parameter.id);if(from<0||to<0)return;ids.splice(from,1);ids.splice(ids.indexOf(parameter.id),0,item.parameterId);onCommand?.({type:"context.order",id:node.id,entityId:id,parameterIds:ids});}}><span className="pin-drag" title="Перетащить параметр" draggable onDragStart={event=>{event.stopPropagation();event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-vigc-context-parameter",JSON.stringify({nodeId:node.id,entityId:id,parameterId:parameter.id}));}}>⠿</span><button className="pin-move" aria-label={`Переместить параметр ${parameter.name} выше`} disabled={parameters[0]?.id===parameter.id} onClick={()=>{const ids=parameters.map(p=>p.id),i=ids.indexOf(parameter.id);if(i>0){[ids[i-1],ids[i]]=[ids[i],ids[i-1]];onCommand?.({type:'context.order',id:node.id,entityId:id,parameterIds:ids});}}}>↑</button><span>{parameter.name}</span>{port(parameter)}</div>):<div className="collapsed-ports" aria-label="Выходы свёрнутой сущности">{shapes.map(shapePort)}{parameters.map(port)}</div>}</div>;
}
const nodeTypes = { draft: DraftBlock };

function toReactNodes(nodes: LogicNode[]): DraftNode[] {
  // Domain parent IDs define a scope, not React Flow's on-canvas containment.
  return nodes.map(({ parentId, ...node }) => node);
}

export function LogicGraph({onCreateSources, checking, spacePressed, modelNodes, modelEdges, document, onCommand, onChange, onImport, noteSignal, toolbar, actionsMenu, selectedIds, onSelected, onSelectShape }: {
  checking:boolean; noteSignal:number; selectedIds:string[]; onSelected:(ids:string[])=>void; onSelectShape:(id:string)=>void; toolbar: HTMLElement | null; actionsMenu:HTMLElement|null; spacePressed: boolean; document: WorkspaceDocument;
  onCommand: (command: WorkspaceCommand) => void; modelNodes: LogicNode[]; modelEdges: LogicEdge[];
  onCreateSources?: (position?:{x:number;y:number},parentId?:string)=>void;
  onChange: (graph: WorkspaceDocument['logic']) => void;
  onImport: (source:string, parentId?:string)=>void;
}) {
  const [naturalSize,setNaturalSize]=useState(false);
  const [scope, setScope] = useState<string | undefined>();
  const [error, setError] = useState('');
  const projection = projectLogic(document.logic, scope);
  const [nodes, setNodes] = useState<DraftNode[]>(() => toReactNodes(projection.nodes));
  const [edges, setEdges] = useState<Edge[]>(projection.edges);
  const surface = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const knownNodes=useRef(new Set(modelNodes.map(node=>node.id)));
  const wireStart=useRef<{nodeId:string;handleId:string}|null>(null);
  const wireContextHandled=useRef(false);
  const suppressPaneContextMenu=useRef(false);
  const [flow, setFlow] = useState<ReactFlowInstance<DraftNode, Edge> | null>(null);
  const [creation, setCreation] = useState<{ source: string; handle:string; x: number; y: number; position: { x: number; y: number } } | null>(null);
  const [paneMenu, setPaneMenu] = useState<{x:number;y:number;position:{x:number;y:number}}|null>(null);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') { setCreation(null); setPaneMenu(null); } };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  useEffect(() => {
    if (!creation && !paneMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.wire-create-menu')) { setCreation(null); setPaneMenu(null); }
    };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [creation, paneMenu]);
  useEffect(() => {
    if (scope && !modelNodes.some(n => n.id === scope)) { setScope(undefined); onSelected([]); }
    const view = projectLogic({ nodes: modelNodes, edges: modelEdges }, scope);
    setNodes(previous=>toReactNodes(view.nodes).map(n => ({...previous.find(old=>old.id===n.id),...n,selected:selectedIds.includes(n.id)})));
    setEdges(view.edges.map(edge=>{const execution=modelEdges.find(e=>e.id===edge.id)?.targetHandle==='exec';const color=execution?'#6255a7':'#6b99d3';const source=modelNodes.find(n=>n.id===edge.source)?.data.graph,target=modelNodes.find(n=>n.id===edge.target)?.data.graph,out=source?graphPorts(source).outputs.find(p=>p.id===edge.sourceHandle):null,input=target?graphPorts(target).inputs.find(p=>p.id===edge.targetHandle):null;const conversion=source?.operation==='parameter'&&input?.type==='parameter'?'Параметр':out?.type==='entity'&&input?.type==='point'?'Положение':undefined;return {...edge,label:conversion,labelStyle:{fontSize:11,fill:'#625579'},labelBgStyle:{fill:'#f7f4ff',stroke:'#c6b6e1'},type:'default',style:{stroke:document.logic.nodes.find(n=>n.id===edge.source)?.data.graph?portColors[graphPorts(document.logic.nodes.find(n=>n.id===edge.source)!.data.graph!).outputs.find(p=>p.id===edge.sourceHandle)?.type??'exec']:color,strokeWidth:execution?1.8:1.3},markerEnd:undefined};}));
  }, [modelNodes, modelEdges, scope, selectedIds]);
  useEffect(()=>{
    const added=modelNodes.filter(node=>!knownNodes.current.has(node.id)&&node.parentId===scope);
    knownNodes.current=new Set(modelNodes.map(node=>node.id));
    const target=added.at(-1);if(!target||!flow)return;
    const visible=projectLogic({nodes:modelNodes,edges:modelEdges},scope);
    const neighbors=visible.edges.filter(edge=>edge.source===target.id||edge.target===target.id).flatMap(edge=>[edge.source,edge.target]);
    const related=[...new Set([target.id,...neighbors])];
    let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{
      const measured=flow.getNodes().filter(node=>related.includes(node.id));
      const width=measured.length?Math.max(...measured.map(n=>n.position.x+(n.measured?.width??250)))-Math.min(...measured.map(n=>n.position.x)):0;
      const height=measured.length?Math.max(...measured.map(n=>n.position.y+(n.measured?.height??200)))-Math.min(...measured.map(n=>n.position.y)):0;
      const fits=width*.7<=(surface.current?.clientWidth??0)*.85&&height*.7<=(surface.current?.clientHeight??0)*.85;
      void flow.fitView({nodes:(fits?related:[target.id]).map(id=>({id})),padding:0.15,minZoom:0.1,maxZoom:1,duration:180});
    });});
    return ()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
  },[modelNodes,modelEdges,flow,scope]);
  const previousCount=useRef(modelNodes.length);
  useEffect(()=>{if(modelNodes.length<previousCount.current&&flow){requestAnimationFrame(()=>requestAnimationFrame(()=>void flow.fitView({padding:.12,minZoom:.03,maxZoom:1,duration:0})));}previousCount.current=modelNodes.length;},[modelNodes.length,flow]);
  function open(id?: string) { setScope(id); onSelected([]); setCreation(null); setError(''); }
  function connect(connection: Connection) {
    if (!connection.source || !connection.target) return;
    try {
      const from = resolveGroupPort(document.logic, connection.source, connection.sourceHandle, 'outputs',document.parameters,document.shapes);
      const to = resolveGroupPort(document.logic, connection.target, connection.targetHandle, 'inputs',document.parameters,document.shapes);
      onCommand({ type: 'logic.connect', edge: { id: crypto.randomUUID(), source: from.nodeId, target: to.nodeId, sourceHandle: from.handle, targetHandle: to.handle } });
      setCreation(null); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Соединение недоступно.'); }
  }
  function newGraphNode(operation:GraphOperation,position?:{x:number;y:number}){const id=crypto.randomUUID();const node:LogicNode={id,type:'draft',...(scope?{parentId:scope}:{}),position:position??flow?.screenToFlowPosition({x:(surface.current?.getBoundingClientRect().left??0)+80,y:(surface.current?.getBoundingClientRect().top??0)+80})??{x:60,y:60},data:{role:['event','trigger'].includes(operation)?'event':['set-value','add','rate','multiply','finish','stop','move','timer','sequence','repeat'].includes(operation)?'action':'calculate',label:graphLabels[operation],graph:{operation,...(operation==='sources'?{fields:[]}:operation==='changes'?{changes:[]}:{}),defaults:Object.fromEntries(graphPorts({operation}).inputs.filter(p=>['number','boolean'].includes(p.type)&&!p.optional).map(p=>[p.id,p.type==='boolean'?false:p.id==='duration'?1:0]))}}};if(!position){for(let attempt=0;attempt<100&&modelNodes.some(n=>n.parentId===scope&&Math.abs(n.position.x-node.position.x)<240&&Math.abs(n.position.y-node.position.y)<190);attempt++)node.position={x:node.position.x+250,y:node.position.y+(attempt%4===3?200:0)};}return node;}
  function addGraph(operation:GraphOperation,position?:{x:number;y:number}){if(operation==='sources'&&onCreateSources){onCreateSources(position,scope);return;}const node=newGraphNode(operation,position);onChange({nodes:[...modelNodes,node],edges:modelEdges});onSelected([node.id]);}
  function openWireMenu(x:number,y:number) {
    if(!wireStart.current||!flow||!surface.current)return false;
    const source=resolveGroupPort(document.logic,wireStart.current.nodeId,wireStart.current.handleId,'outputs',document.parameters,document.shapes);
    if(!source.handle||(!document.logic.nodes.find(n=>n.id===source.nodeId)?.data.graph&&!(source.handle.startsWith('parameter:')||source.handle.startsWith('shape:')||['value','then','true','false','body'].includes(source.handle))))return false;
    const bounds=surface.current.getBoundingClientRect();
    setCreation({source:source.nodeId,handle:source.handle,position:flow.screenToFlowPosition({x,y}),x:Math.max(0,Math.min(x-bounds.left,bounds.width-220)),y:Math.max(0,Math.min(y-bounds.top,bounds.height-220))});
    setPaneMenu(null);wireStart.current=null;wireContextHandled.current=true;return true;
  }
  const handledNoteSignal=useRef(noteSignal);
  useEffect(()=>{if(noteSignal===handledNoteSignal.current)return;handledNoteSignal.current=noteSignal;const id=crypto.randomUUID();onCommand({type:'note.create',id,position:{x:projection.nodes.reduce((right,n)=>Math.max(right,n.position.x+350),60),y:50},...(scope?{parentId:scope}:{})});onSelected([id]);},[noteSignal]);
  const current = modelNodes.find(n => n.id === scope);
  function findNodes() {
    if(!flow)return;
    const visibleIds=new Set(projection.nodes.map(node=>node.id));
    const selected=selectedIds.filter(id=>visibleIds.has(id));
    const targetIds=selected.length?selected:projection.nodes.map(node=>node.id);
    if(!targetIds.length)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>void flow.fitView({nodes:targetIds.map(id=>({id})),padding:0.12,minZoom:0.03,maxZoom:1,duration:0})));
  }
  const boundsWidth=Math.max(900,...projection.nodes.map(n=>n.position.x+320))-Math.min(0,...projection.nodes.map(n=>n.position.x));
  const boundsHeight=Math.max(700,...projection.nodes.map(n=>n.position.y+300))-Math.min(0,...projection.nodes.map(n=>n.position.y));
  useEffect(()=>{if(naturalSize&&flow)requestAnimationFrame(()=>requestAnimationFrame(()=>void flow.fitView({padding:.02,minZoom:1,maxZoom:1,duration:0})));},[naturalSize,flow]);
  return <section style={naturalSize?{width:boundsWidth+120,height:boundsHeight+120}:undefined} className={`panel graph-panel ${naturalSize?'graph-natural':''}`} aria-label="Редактор схемы" data-onboarding-focus="graph">
    <div className="panel-heading"><h2>Схема</h2><span className="header-spacer"/><IconButton icon={naturalSize?"minimize":"fit"} label={naturalSize?"Вернуть обычный размер схемы":"Обзор схемы без уменьшения"} onClick={()=>setNaturalSize(v=>!v)}/><IconButton icon="focus" label="Вернуться к нодам" onClick={findNodes}/></div>
    {toolbar && createPortal(<details className="popover-anchor node-catalog"><summary className="icon-button" aria-label="Добавить блок" title="Добавить блок"><Icon name="layers" /></summary>
      <div className="popover node-palette-popover"><GraphPalette onChoose={operation=>addGraph(operation)}/></div>
    </details>, toolbar)}
    {scope&&<div className="composition-toolbar" aria-label="Композиция схемы"><button onClick={() => open(current?.parentId)}>← На уровень выше</button>{current&&<span>{current.data.label}</span>}</div>}
    <input ref={fileInput} type="file" accept=".yaml,.yml,application/yaml,text/yaml" hidden aria-label="Выбрать YAML" onChange={async event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(!file)return;try{if(file.size>1_000_000)throw Error("Файл YAML слишком большой.");onImport(await file.text(),scope);setError("");}catch(cause){setError(cause instanceof Error?cause.message:"Не удалось прочитать файл.");}}}/>
    {actionsMenu&&createPortal(<div onClick={event=>{if(event.target instanceof Element&&event.target.closest('button:not(:disabled)'))actionsMenu.closest('details.project-menu')?.removeAttribute('open');}}><hr/>
        <button onClick={()=>fileInput.current?.click()}>Импорт YAML</button>
        <button disabled={!projection.nodes.length} onClick={()=>{try {const source=exportLogicYaml({...document,logic:{nodes:modelNodes,edges:modelEdges}},selectedIds.length?selectedIds:projection.nodes.map(n=>n.id));const url=URL.createObjectURL(new Blob([source],{type:'application/yaml'}));const link=window.document.createElement('a');link.href=url;link.download='vigc-logic.yaml';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'Не удалось экспортировать схему.');}}}>Экспорт YAML</button>
        <button disabled={!selectedIds.length} onClick={() => { onCommand({ type: 'logic.group', id: crypto.randomUUID(), nodeIds: selectedIds, name: 'Составной блок' }); onSelected([]); }}>Свернуть в блок</button>
        <button disabled={!selectedIds.length} onClick={() => onCommand({ type: 'logic.duplicate', nodeIds: selectedIds, copyId: crypto.randomUUID() })}>Копировать выделенное</button>
        <button disabled={selectedIds.length !== 1 || modelNodes.find(n => n.id === selectedIds[0])?.data.role !== 'group'} onClick={() => { onCommand({ type: 'logic.ungroup', id: selectedIds[0]! }); onSelected([]); }}>Развернуть блок</button>
        <button disabled={!selectedIds.length} onClick={() => { onCommand({ type: 'logic.remove', nodeIds: selectedIds }); onSelected([]); }}>Удалить выделенное</button>

      </div>,actionsMenu)}
    {error && <p role="alert" className="binding-error">{error}</p>}
    <div className="graph-surface" ref={surface} onMouseDownCapture={event=>{if(event.button===2&&event.target instanceof Element&&event.target.closest('.react-flow__pane')&&openWireMenu(event.clientX,event.clientY)){event.preventDefault();event.stopPropagation();suppressPaneContextMenu.current=true;}}}>
      {!nodes.length && <div className="empty-hint">Соберите схему<small>ПКМ или кнопка блоков в тулбаре</small></div>}
      <ReactFlow multiSelectionKeyCode="Shift" key={scope ?? 'root'} onInit={setFlow} onPaneClick={() => {setCreation(null);setPaneMenu(null);onSelected([]);}} onEdgeClick={()=>onSelected([])} onNodeClick={(event,node)=>onSelected(event.shiftKey||event.metaKey||event.ctrlKey?[...new Set([...selectedIds,node.id])]:[node.id])} onConnectStart={(_,params)=>{setCreation(null);setPaneMenu(null);wireContextHandled.current=false;suppressPaneContextMenu.current=false;wireStart.current=params.handleType==='source'&&params.nodeId&&params.handleId?{nodeId:params.nodeId,handleId:params.handleId}:null;}} onPaneContextMenu={event=>{event.preventDefault();if(suppressPaneContextMenu.current){suppressPaneContextMenu.current=false;return;}if(openWireMenu(event.clientX,event.clientY))return;if(!flow||!surface.current)return;const bounds=surface.current.getBoundingClientRect();setCreation(null);setPaneMenu({position:flow.screenToFlowPosition({x:event.clientX,y:event.clientY}),x:Math.max(0,Math.min(event.clientX-bounds.left,bounds.width-370)),y:Math.max(0,Math.min(event.clientY-bounds.top,bounds.height-220))});}}
        onNodeDoubleClick={(_, node) => { if (node.data.role === 'group') open(node.id); }}
        isValidConnection={connection => {
          try {
            const from = resolveGroupPort(document.logic, connection.source, connection.sourceHandle, 'outputs',document.parameters,document.shapes);
            const to = resolveGroupPort(document.logic, connection.target, connection.targetHandle, 'inputs',document.parameters,document.shapes);
            logicConnectionKind(document.logic,{source:from.nodeId,target:to.nodeId,sourceHandle:from.handle,targetHandle:to.handle}); return true;
          } catch { return false; }
        }}
        onConnectEnd={(event, state) => {
          wireStart.current=null;
          if(wireContextHandled.current){wireContextHandled.current=false;return;}
          if (state.isValid || state.fromHandle?.type !== 'source' || !state.fromNode || !flow || !surface.current) return;
          const target = event.target;
          if (!(target instanceof Element) || !target.closest('.react-flow__pane')) return;
          const source = resolveGroupPort(document.logic, state.fromNode.id, state.fromHandle.id, 'outputs',document.parameters,document.shapes);
          if (!source.handle || (!document.logic.nodes.find(n=>n.id===source.nodeId)?.data.graph&&!((source.handle.startsWith('parameter:')||source.handle.startsWith('shape:'))||['value','then','true','false','body'].includes(source.handle)))) return;
          const point = 'changedTouches' in event ? event.changedTouches[0] : event;
          if (!point) return;
          const bounds = surface.current.getBoundingClientRect();
          setCreation({ source: source.nodeId, handle:source.handle, position: flow.screenToFlowPosition({ x: point.clientX, y: point.clientY }), x: Math.max(0, Math.min(point.clientX - bounds.left, bounds.width - 220)), y: Math.max(0, Math.min(point.clientY - bounds.top, bounds.height - 130)) });
        }} nodes={nodes.map(node => ({ ...node, data: { ...node.data, checking, document, targetId: node.id, onCommand, onOpen: open, onSelectShape, selected: node.selected, onToggle: (id: string) => onSelected(selectedIds.includes(id)?selectedIds.filter(selected=>selected!==id):[...selectedIds,id]) } }))} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={changes => {
          const next = applyNodeChanges(changes, nodes) as DraftNode[];
          setNodes(next);
          if(changes.some(change=>change.type==='select'))onSelected(next.filter(node=>node.selected).map(node=>node.id));
          const removed = changes.filter(c => c.type === 'remove').map(c => c.id);
          if (removed.length) onCommand({ type: 'logic.remove', nodeIds: removed });
          else if (changes.some(c => c.type === 'position' && c.dragging === false)) {
            const positions = new Map(next.map(n => [n.id, n.position]));
            onChange({ nodes: modelNodes.map(n => positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n), edges: modelEdges });
          }
        }} onEdgesChange={changes => {
          setEdges(currentEdges => applyEdgeChanges(changes, currentEdges));
          changes.filter(c => c.type === 'remove').forEach(c => onCommand({ type: 'logic.disconnect', edgeId: c.id }));
        }} onConnect={connect} panOnScroll zoomOnScroll={false} zoomOnPinch panOnDrag={spacePressed ? true : [1]} minZoom={0.1} maxZoom={4}
        proOptions={{ hideAttribution: true }}><Background gap={24} color="#e1e3e9" /><Controls showInteractive={false} /></ReactFlow>
      {creation && document.logic.nodes.find(n=>n.id===creation.source)?.data.graph ? <div className="wire-create-menu" style={{left:creation.x,top:creation.y}}><GraphPalette sourceType={graphPorts(document.logic.nodes.find(n=>n.id===creation.source)!.data.graph!).outputs.find(p=>p.id===creation.handle)?.type} onChoose={operation=>{const node=newGraphNode(operation,creation.position),sourceType=graphPorts(document.logic.nodes.find(n=>n.id===creation.source)!.data.graph!).outputs.find(p=>p.id===creation.handle)!.type;const input=graphPorts(node.data.graph!).inputs.find(p=>p.type===sourceType||sourceType==='entity'&&p.type==='point'||sourceType==='area'&&p.type==='set')!;onCommand({type:'logic.create-connected',node,edge:{id:crypto.randomUUID(),source:creation.source,sourceHandle:creation.handle,target:node.id,targetHandle:input.id}});onSelected([node.id]);setCreation(null);}}/></div>:creation && <div className="wire-create-menu" role="dialog" aria-label="Создать связанный блок" style={{ left: creation.x, top: creation.y }}>
        <strong>Создать и соединить</strong>{(creation.handle.startsWith('shape:')?(['spatial',...(document.shapes.some(s=>`shape:${s.id}`===creation.handle&&['point','circle'].includes(s.kind))?['event' as const]:[])] as const):(creation.handle==='value'||creation.handle.startsWith('parameter:'))?(['calculate','condition','action','repeat'] as const):(['condition','action','repeat'] as const)).map(role=><button key={role} onClick={()=>{
          const id=crypto.randomUUID(), inputId=crypto.randomUUID(), shape=creation.handle.startsWith('shape:'), trigger=role==='event', value=creation.handle==='value'||creation.handle.startsWith('parameter:');
          const expression=role==='condition'?(value?'значение_1 > 0':'true'):role==='repeat'?(value?'значение_1':'1'):(value?'значение_1':'0');
          onCommand({type:'logic.create-connected',node:{id,type:'draft',...(scope?{parentId:scope}:{}),position:creation.position,data:{role,label:roleLabels[role],...(trigger?{event:{trigger:'enter' as const}}:shape?{spatial:{operation:'position' as const,originId:''}}:{calculation:{expression,inputs:value?[{id:inputId,alias:'значение_1'}]:[]}})}},edge:{id:crypto.randomUUID(),source:creation.source,sourceHandle:creation.handle,target:id,targetHandle:trigger?(document.shapes.find(s=>`shape:${s.id}`===creation.handle)?.kind==='circle'?'zone':'point'):shape?'origin':value?inputId:'exec'}});setCreation(null);onSelected([id]);
        }}><Icon name={roleIcons[role]}/> {roleLabels[role]}</button>)}<button onClick={()=>setCreation(null)}>Отмена</button>
      </div>}
      {paneMenu && <div className="wire-create-menu node-palette-menu" aria-label="Добавить блок на схему" style={{left:paneMenu.x,top:paneMenu.y}}><GraphPalette onChoose={operation=>{addGraph(operation,paneMenu.position);setPaneMenu(null);}}/></div>}
    </div>
  </section>;
}
