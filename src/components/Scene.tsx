import {SceneInspector} from './SceneInspector.tsx';
import {spatialTrace} from '../engine/spatial.ts';
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Circle, Text, Arrow, Group, Line, Rect, RegularPolygon, Arc } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { readCircleCenter, readCircleRadius, readPointEntity, readTargetParameter, readShapeGeometry } from '../workspace/bindings.ts';
import { readDrag } from './ContentTree.tsx';
import type { DragItem } from './ContentTree.tsx';
import type { WorkspaceCommand, WorkspaceDocument, SceneShape, ShapeKind } from '../workspace/document.ts';
import { IconButton } from './Icon.tsx';
import { readParameterValue } from '../engine/calculations.ts';

function draggedRadius(x: number, y: number): number {
  return Math.max(0.01, Math.round(Math.hypot(x, y) * 100) / 100);
}

function DebugParameterInput({label,value,disabled,onChange}:{label:string;value:number|null;disabled:boolean;onChange:(value:number)=>void}) {
  const input=useRef<HTMLInputElement>(null);
  const [draft,setDraft]=useState(value===null?'':String(value));
  useEffect(()=>{if(document.activeElement!==input.current)setDraft(value===null?'':String(value));},[value]);
  return <input ref={input} aria-label={`${label} в проверке`} type="number" step="any" value={draft} disabled={disabled} onPointerDown={event=>event.stopPropagation()} onChange={event=>{const next=event.currentTarget.value;setDraft(next);const numeric=event.currentTarget.valueAsNumber;if(Number.isFinite(numeric))onChange(numeric);}}/>;
}

function sceneBounds(shapes:SceneShape[]){
  const bounds=shapes.map(shape=>{
    const angle=(shape.rotation??0)*Math.PI/180;
    if(shape.kind==='rectangle'){
      const halfWidth=(shape.width??160)/2,halfHeight=(shape.height??100)/2;
      const x=Math.abs(Math.cos(angle))*halfWidth+Math.abs(Math.sin(angle))*halfHeight;
      const y=Math.abs(Math.sin(angle))*halfWidth+Math.abs(Math.cos(angle))*halfHeight;
      return {left:shape.x-x,right:shape.x+x,top:shape.y-y,bottom:shape.y+y};
    }
    const radius=shape.kind==='point'?12:['circle','chart','polygon'].includes(shape.kind)?shape.radius:0;
    return {left:shape.x-radius,right:shape.x+radius,top:shape.y-radius,bottom:shape.y+radius};
  });
  return {left:Math.min(...bounds.map(bound=>bound.left)),right:Math.max(...bounds.map(bound=>bound.right)),top:Math.min(...bounds.map(bound=>bound.top)),bottom:Math.max(...bounds.map(bound=>bound.bottom))};
}

export function Scene({ highlightedEntityIds, document, shapes, selectedId, onSelect, onMove, onResize, spacePressed, selectedIds, onCommand, onDropItem, onPlacement, onDebugValue, liveInteraction, interactionLocked, placementKind, onPlace,fitSceneKey=null }: {
  placementKind:ShapeKind|null; onPlace:(position:{x:number;y:number},geometry?:Partial<Pick<SceneShape,'width'|'height'|'radius'|'innerRadius'|'rotation'>>)=>void;
  fitSceneKey?:string|null;
  liveInteraction:boolean; interactionLocked:boolean; onDebugValue:(id:string,value:number)=>void;
  highlightedEntityIds:string[]; document: WorkspaceDocument; shapes: SceneShape[]; selectedId: string | null; onSelect: (id: string | null, multiple?:boolean) => void; selectedIds:string[]; onPlacement:(position:{x:number;y:number})=>void; onCommand:(command:WorkspaceCommand)=>void; onDropItem:(item:DragItem,position:{x:number;y:number})=>void;
  onMove: (id: string, x: number, y: number) => void; onResize: (id: string, radius: number) => void; spacePressed: boolean;
}) {
  const [draw,setDraw]=useState<{start:{x:number;y:number};end:{x:number;y:number}}|null>(null);
  const drawing=useRef<typeof draw>(null);
  const [geometryPreview,setGeometryPreview]=useState<{id:string;update:Partial<SceneShape>}|null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 500 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const originalView=useRef<typeof view|null>(null);
  const fitRequest=useRef('');
  const [radiusPreview, setRadiusPreview] = useState<{ id: string; radius: number } | null>(null);
  const [dragPreview,setDragPreview]=useState<{id:string;x:number;y:number}|null>(null);
  const displayDrag=useRef<{id:string;pointerId:number;startX:number;startY:number;x:number;y:number;moved:boolean}|null>(null);
  const [displayPreview,setDisplayPreview]=useState<{id:string;x:number;y:number}|null>(null);
  const activeResize = useRef<{ stopDrag(): void } | null>(null);
  const resizeCancelled = useRef(false);
  const recordingDrag = useRef<{ stopDrag():void } | null>(null);
  const recordingCancelled = useRef(false);
  const legacyValuePositions=new Map<string,{x:number;y:number}>();
  shapes.filter(shape=>shape.kind==='value').forEach((shape,index)=>{
    if(shape.x<8||shape.x>size.width-172||shape.y<8||shape.y>size.height-72)legacyValuePositions.set(shape.id,{x:Math.max(8,size.width-176),y:Math.max(8,Math.min(size.height-72,36+index*68))});
  });
  useEffect(()=>{
    const stop = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !recordingDrag.current) return;
      recordingCancelled.current = true;
      recordingDrag.current.stopDrag(); recordingDrag.current = null;
    };
    window.addEventListener('keydown',stop);
    return ()=>window.removeEventListener('keydown',stop);
  },[]);

  useEffect(() => {
    const cancelResize = () => {
      if (!activeResize.current) return;
      resizeCancelled.current = true;
      activeResize.current.stopDrag();
      activeResize.current = null;
      setRadiusPreview(null);
    };
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelResize(); };
    window.addEventListener('keydown', cancel);
    window.addEventListener('blur', cancelResize);
    window.addEventListener('pointercancel', cancelResize);
    return () => {
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('blur', cancelResize);
      window.removeEventListener('pointercancel', cancelResize);
    };
  }, []);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(container.current!); return () => observer.disconnect();
  }, []);
  useEffect(()=>{
    if(!fitSceneKey){if(originalView.current){setView(originalView.current);originalView.current=null;}fitRequest.current='';return;}
    const request=`${fitSceneKey}:${Math.round(size.width)}x${Math.round(size.height)}`;
    if(fitRequest.current===request||!shapes.length||size.width<1||size.height<1)return;
    const bounds=sceneBounds(shapes),width=Math.max(1,bounds.right-bounds.left),height=Math.max(1,bounds.bottom-bounds.top),padding=Math.min(56,size.width*.08,size.height*.08);
    const scale=Math.max(.2,Math.min(1.7,(size.width-padding*2)/width,(size.height-padding*2)/height));
    originalView.current??=view;fitRequest.current=request;
    setView({scale,x:size.width/2-(bounds.left+bounds.right)/2*scale,y:size.height/2-(bounds.top+bounds.bottom)/2*scale});
  },[fitSceneKey,shapes,size,view]);
  useEffect(()=>onPlacement({x:Math.max(8,size.width-176),y:36}),[size,onPlacement]);
  function zoom(factor: number, point = { x: size.width / 2, y: size.height / 2 }) {
    setView(current => {
      const scale = Math.max(0.1, Math.min(4, current.scale * factor));
      return { scale, x: point.x - (point.x - current.x) * scale / current.scale, y: point.y - (point.y - current.y) * scale / current.scale };
    });
  }
  function wheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    if (event.evt.ctrlKey || event.evt.metaKey) {
      zoom(Math.exp(-event.evt.deltaY * 0.01), event.target.getStage()!.getPointerPosition()!); return;
    }
    setView(current => ({ ...current, x: current.x - event.evt.deltaX, y: current.y - event.evt.deltaY }));
  }
  return <div className={`scene ${spacePressed ? 'pan-mode' : placementKind?'placement-mode':''}`} ref={container} aria-label="Визуальный холст" onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-vigc-item'))event.preventDefault();}} onDrop={event=>{event.preventDefault();const item=readDrag(event);if(!item)return;const bounds=event.currentTarget.getBoundingClientRect();onDropItem(item,{x:(event.clientX-bounds.left-view.x)/view.scale,y:(event.clientY-bounds.top-view.y)/view.scale});}}>
    {!shapes.length && <div className="empty-hint">Выберите фигуру в тулбаре</div>}
    <Stage width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
      draggable={spacePressed} onWheel={wheel}
      onDragEnd={event => { if (event.target === event.target.getStage()) setView(current => ({ ...current, x: event.target.x(), y: event.target.y() })); }}
      onMouseDown={event => {if(placementKind&&!spacePressed){const p=event.target.getStage()?.getRelativePointerPosition();if(p){drawing.current={start:p,end:p};setDraw(drawing.current);}return;} if(event.target===event.target.getStage()&&!spacePressed)onSelect(null);}}
      onMouseLeave={()=>{drawing.current=null;setDraw(null);}}
      onMouseMove={event=>{if(drawing.current){const p=event.target.getStage()?.getRelativePointerPosition();if(p){drawing.current={...drawing.current,end:p};setDraw(drawing.current);}}}}
      onMouseUp={()=>{const draft=drawing.current;drawing.current=null;setDraw(null);if(!draft||!placementKind)return;const {start,end}=draft,dx=end.x-start.x,dy=end.y-start.y,dragged=Math.hypot(dx,dy)>4;const position=dragged&&['rectangle','arrow'].includes(placementKind)?{x:(start.x+end.x)/2,y:(start.y+end.y)/2}:start;onPlace(position,dragged?(['rectangle','arrow'].includes(placementKind)?{width:Math.max(1,Math.abs(dx)),height:Math.max(1,Math.abs(dy))}:['circle','polygon','chart'].includes(placementKind)?{radius:Math.hypot(dx,dy),...(placementKind==='chart'?{innerRadius:0}:{})}:undefined):undefined);}}
      onTap={event=>{if(placementKind&&!spacePressed){const position=event.target.getStage()?.getRelativePointerPosition();if(position)onPlace(position);}}}>
      <Layer>
        {document.paths.map(path=><Line key={path.id} points={path.points.flatMap(p=>[p.x,p.y])} stroke="#756dbb" strokeWidth={2/view.scale} dash={[6/view.scale,4/view.scale]} listening={false}/>)}
        {document.recording && <Line points={document.recording.points.flatMap(p=>[p.x,p.y])} stroke="#756dbb" strokeWidth={2/view.scale} listening={false}/>}
        {[...shapes.filter(s=>s.kind!=='point'),...shapes.filter(s=>s.kind==='point')].map(sourceShape => {
        const geometry=readShapeGeometry(document,sourceShape);
        const reading = sourceShape.kind === 'circle' ? readCircleRadius(document, sourceShape) : { radius: geometry.shape.radius };
        const center = sourceShape.centerPointId ? readCircleCenter(document, sourceShape) : { position: { x: sourceShape.x, y: sourceShape.y } };
        const shape = { ...geometry.shape,...(geometryPreview?.id===sourceShape.id?geometryPreview.update:{}), ...(center.position ?? {}), radius: radiusPreview?.id === sourceShape.id ? radiusPreview.radius : geometryPreview?.id===sourceShape.id&&geometryPreview.update.radius!==undefined?geometryPreview.update.radius:reading.radius ?? 0 };
        const opacity=1-shape.transparency/100;
        const message = center.message ?? reading.message ?? geometry.message;
        const radiusSource = readTargetParameter(document, { kind: 'shape', id: shape.id });
        const computedRadius = radiusSource.status === 'resolved' && Boolean(radiusSource.parameter.sourceNodeId);
        const canResize = !computedRadius && !liveInteraction && !interactionLocked && !shape.geometryLocked && shape.kind === 'circle' && reading.radius !== null && center.position !== null;
        const participant = readPointEntity(document, sourceShape);
        return <Group key={shape.id} x={shape.x} y={shape.y} rotation={shape.rotation??0} draggable={!shape.geometryLocked && !spacePressed && !placementKind && !interactionLocked && center.position !== null && (!document.recording || document.recording.pointId===shape.id)}
        onClick={event => { if (!spacePressed&&!placementKind) onSelect(shape.id,event.evt.shiftKey||event.evt.metaKey||event.evt.ctrlKey); }} onTap={() => { if (!spacePressed&&!placementKind) onSelect(shape.id); }}
        onMouseEnter={() => setHoveredId(shape.id)} onMouseLeave={() => setHoveredId(null)}
        onDragStart={event=>{ recordingCancelled.current=false; if(document.recording?.pointId===shape.id) recordingDrag.current=event.target; }}
        onDragMove={event=>{setDragPreview({id:shape.id,x:event.target.x(),y:event.target.y()});if((liveInteraction||document.recording?.pointId===shape.id) && !recordingCancelled.current){event.cancelBubble=true;onMove(shape.id,event.target.x(),event.target.y());} }}
        onDragEnd={event => { event.cancelBubble = true; recordingDrag.current=null;setDragPreview(null); if(recordingCancelled.current)return; onMove(shape.id, event.target.x(), event.target.y()); }}>
        {shape.kind === 'circle' && !message && reading.radius !== null && center.position !== null && <Circle radius={shape.radius} fill={shape.color} opacity={opacity} />}
        {shape.kind === 'circle' && !message && reading.radius !== null && center.position !== null && <Circle radius={shape.radius} stroke={shape.color} strokeWidth={selectedIds.includes(shape.id) ? 2 : 1} opacity={opacity} />}
        {shape.kind==='circle'&&selectedIds.includes(shape.id)&&<Circle listening={false} radius={shape.radius+3/view.scale} stroke="#756dbb" strokeWidth={1.5/view.scale} dash={[4/view.scale,4/view.scale]} opacity={.9}/>}
        {shape.entityId&&highlightedEntityIds.includes(shape.entityId)&&(shape.kind==='point'||shape.kind==='circle'||shape.kind==='polygon'||shape.kind==='chart'?<Circle listening={false} radius={shape.kind==='point'?16:Math.max(20,shape.radius+10)} stroke="#8f6ad1" strokeWidth={2/view.scale} dash={[6/view.scale,4/view.scale]} opacity={.8}/>:<Rect listening={false} x={-(shape.width??160)/2-8} y={-(shape.height??100)/2-8} width={(shape.width??160)+16} height={(shape.height??100)+16} stroke="#8f6ad1" strokeWidth={2/view.scale} dash={[6/view.scale,4/view.scale]} opacity={.8}/>)}
        {shape.kind === 'point' && <Circle radius={7} fill={shape.color} stroke="white" strokeWidth={2} opacity={opacity} />}
        {shape.kind === 'arrow' && <Arrow points={[-(shape.width??160)/2, (shape.height??100)/2, (shape.width??160)/2, -(shape.height??100)/2]} fill={shape.color} stroke={shape.color} opacity={opacity} />}
        {shape.kind==='rectangle'&&!message&&<Rect x={-(shape.width??160)/2} y={-(shape.height??100)/2} width={shape.width??160} height={shape.height??100} fill={shape.color} opacity={opacity}/>}
        {shape.kind==='polygon'&&!message&&<RegularPolygon sides={shape.sides??5} radius={shape.radius} fill={shape.color} opacity={opacity}/>}
        {shape.kind==='chart'&&!message&&<Arc innerRadius={shape.innerRadius??45} outerRadius={shape.radius} angle={(shape.fillPercent??75)*3.6} rotation={-90} fill={shape.color} opacity={opacity}/>}
        {shape.kind==='text'&&shape.labelVisible!==false&&<Text text={shape.name} y={-38} fill={shape.color} fontSize={14} opacity={opacity}/>}
        {shape.kind==='value'&&(()=>{const parameter=document.parameters.find(p=>p.id===shape.displayParameterId);const result=shape.displayParameterId?readParameterValue(document,shape.displayParameterId):null;return <Group opacity={1-shape.transparency/100}><Rect x={-78} y={-30} width={156} height={60} cornerRadius={14} fill="#f5f8ff" stroke={shape.color} shadowColor="#788ca5" shadowBlur={8} shadowOpacity={.2}/><Text x={-65} y={-20} width={130} text={parameter?(shape.labelVisible===false?'':shape.name):'Параметр удалён'} fill="#788ca5" fontSize={12}/><Text x={-65} y={-2} width={130} text={result?.status==='ready'?String(result.value):'—'} fill={result?.status==='error'?'#a23a55':'#333d46'} fontSize={18}/></Group>;})()}
        {shape.kind==='comment'&&<Group opacity={1-shape.transparency/100} onDblClick={()=>onCommand({type:'shape.update',id:shape.id,update:{collapsed:!shape.collapsed}})}>
          <Rect width={shape.collapsed?180:240} height={shape.collapsed?40:110} cornerRadius={14} fill="#f5f7ff" stroke={shape.color} shadowColor="#788ca5" shadowBlur={8} shadowOpacity={.2}/>
          <Text text={shape.labelVisible===false?'':shape.name} x={12} y={12} width={shape.collapsed?132:192} fontSize={14} fill="#333d46"/>
          {!shape.collapsed&&<Text text={shape.comment??''} x={12} y={42} width={216} height={60} wrap="word" fontSize={13} fill="#586c84"/>}
          <Group x={shape.collapsed?154:214} y={8} onClick={event=>{event.cancelBubble=true;onCommand({type:'shape.update',id:shape.id,update:{collapsed:!shape.collapsed}});}} onTap={event=>{event.cancelBubble=true;onCommand({type:'shape.update',id:shape.id,update:{collapsed:!shape.collapsed}});}}><Rect width={20} height={24} cornerRadius={7} fill="#e0e5f4"/><Text text={shape.collapsed?'+':'−'} x={5} y={4} fill="#2c388e"/></Group>
        </Group>}
        {selectedIds.includes(shape.id)&&shape.kind!=='circle'&&<Rect listening={false} x={shape.kind==='comment'?-4:shape.kind==='value'?-82:-(shape.kind==='point'?12:shape.kind==='rectangle'||shape.kind==='arrow'?(shape.width??160)/2+4:shape.radius+4)} y={shape.kind==='comment'?-4:shape.kind==='value'?-34:-(shape.kind==='point'?12:shape.kind==='rectangle'||shape.kind==='arrow'?(shape.height??100)/2+4:shape.radius+4)} width={shape.kind==='comment'?(shape.collapsed?188:248):shape.kind==='value'?164:shape.kind==='point'?24:shape.kind==='rectangle'||shape.kind==='arrow'?(shape.width??160)+8:shape.radius*2+8} height={shape.kind==='comment'?(shape.collapsed?48:118):shape.kind==='value'?68:shape.kind==='point'?24:shape.kind==='rectangle'||shape.kind==='arrow'?(shape.height??100)+8:shape.radius*2+8} stroke="#756dbb" strokeWidth={1/view.scale} dash={[4/view.scale,4/view.scale]}/>}
        {shape.kind === 'circle' && reading.radius !== null && center.position !== null && hoveredId === shape.id && <Group listening={false}>
          <Line points={[0, 0, shape.radius, 0]} stroke={shape.color} dash={[4, 4]} />
          <Text text={`Радиус: ${shape.radius}`} x={8} y={8} fill="#011b34" fontSize={14} />
        </Group>}
        {canResize && selectedId === shape.id && !spacePressed && <Circle x={shape.radius} y={0} radius={7 / view.scale}
          fill="white" stroke="#756dbb" strokeWidth={2 / view.scale} draggable
          onMouseDown={event => { event.cancelBubble = true; }}
          onTouchStart={event => { event.cancelBubble = true; }}
          onDragStart={event => { event.cancelBubble = true; resizeCancelled.current = false; activeResize.current = event.target; }}
          onDragMove={event => {
            event.cancelBubble = true;
            const radius = draggedRadius(event.target.x(), event.target.y());
            setRadiusPreview({ id: shape.id, radius });
          }}
          onDragEnd={event => {
            event.cancelBubble = true;
            const radius = draggedRadius(event.target.x(), event.target.y());
            event.target.position({ x: radius, y: 0 });
            activeResize.current = null;
            setRadiusPreview(null);
            if (resizeCancelled.current) { event.target.position({ x: reading.radius!, y: 0 }); return; }
            onResize(shape.id, radius);
          }} />}
        {selectedId===shape.id&&!spacePressed&&!placementKind&&!liveInteraction&&!interactionLocked&&!shape.geometryLocked&&!message&&<>
          {(['rectangle','arrow'].includes(shape.kind)?[[-1,-1],[1,-1],[-1,1],[1,1]]:[]).map(([sx,sy])=><GeometryHandle key={`${sx}-${sy}`} x={sx*(shape.width??160)/2} y={sy*(shape.height??100)/2} scale={view.scale} label="Размер" onCancel={()=>setGeometryPreview(null)} onPreview={(x,y)=>setGeometryPreview({id:shape.id,update:{width:Math.max(1,Math.abs(x)*2),height:Math.max(1,Math.abs(y)*2)}})} onCommit={(x,y)=>{setGeometryPreview(null);onCommand({type:'shape.update',id:shape.id,update:{width:Math.max(1,Math.abs(x)*2),height:Math.max(1,Math.abs(y)*2)}});}}/>)}
          {['polygon','chart'].includes(shape.kind)&&<GeometryHandle x={shape.radius} y={0} scale={view.scale} label="Внешний радиус" onCancel={()=>setGeometryPreview(null)} onPreview={(x,y)=>{const radius=Math.max(.01,Math.hypot(x,y));setGeometryPreview({id:shape.id,update:{radius,...(shape.kind==='chart'?{innerRadius:Math.min(shape.innerRadius??45,radius-.01)}:{})}});}} onCommit={(x,y)=>{setGeometryPreview(null);const radius=Math.max(.01,Math.hypot(x,y));onCommand({type:'shape.update',id:shape.id,update:{radius,...(shape.kind==='chart'?{innerRadius:Math.min(shape.innerRadius??45,radius-.01)}:{})}});}}/>}
          {shape.kind==='chart'&&<>
            <GeometryHandle x={shape.innerRadius??45} y={0} scale={view.scale} label="Внутренний радиус" onCommit={(x,y)=>onCommand({type:'shape.update',id:shape.id,update:{innerRadius:Math.min(shape.radius-.01,Math.hypot(x,y))}})}/>
            <GeometryHandle x={Math.cos(((shape.fillPercent??75)*3.6-90)*Math.PI/180)*shape.radius} y={Math.sin(((shape.fillPercent??75)*3.6-90)*Math.PI/180)*shape.radius} scale={view.scale} label="Угол сектора" onCommit={(x,y)=>onCommand({type:'shape.update',id:shape.id,update:{fillPercent:(((Math.atan2(y,x)*180/Math.PI+90)%360+360)%360)/3.6}})}/>
          </>}
          {['rectangle','polygon','chart','arrow'].includes(shape.kind)&&<GeometryHandle x={0} y={-(['rectangle','arrow'].includes(shape.kind)?(shape.height??100)/2:shape.radius)-28/view.scale} scale={view.scale} label="Поворот" onCommit={(x,y)=>onCommand({type:'shape.update',id:shape.id,update:{rotation:(shape.rotation??0)+Math.atan2(y,x)*180/Math.PI+90}})}/>}
          {shape.anchors?.map(a=><GeometryHandle key={a.id} x={a.x} y={a.y} scale={view.scale} label={a.name} color="#bd6b25" onCommit={(x,y)=>onCommand({type:'shape.update',id:shape.id,update:{anchors:shape.anchors!.map(item=>item.id===a.id?{...item,x,y}:item)}})}/>)}
        </>}
        {(message||participant.status==='missing') && <Text text={`${shape.name}: ${message??'Связанный участник удалён.'}`} x={-70} y={8} width={200} fill="#9c2940" fontSize={14} />}
      </Group>})}</Layer>
      <Layer listening={false}>
        {draw&&placementKind&&(['rectangle','arrow'].includes(placementKind)?<Rect x={Math.min(draw.start.x,draw.end.x)} y={Math.min(draw.start.y,draw.end.y)} width={Math.abs(draw.end.x-draw.start.x)} height={Math.abs(draw.end.y-draw.start.y)} stroke="#756dbb" fill="#8f6ad122" dash={[4,4]}/>:<Circle x={draw.start.x} y={draw.start.y} radius={Math.hypot(draw.end.x-draw.start.x,draw.end.y-draw.start.y)} stroke="#756dbb" dash={[4,4]}/>)}
        {document.logic.nodes.filter(n=>n.data.role==='spatial'&&['trace','raycast'].includes(n.data.spatial?.operation??'')).map(node=>{try{const trace=spatialTrace(document,node.data.spatial!,id=>{const r=readParameterValue(document,id);if(r.status==='error')throw Error(r.message);return r.value;});return <Group key={node.id}><Line points={[trace.from.x,trace.from.y,trace.to.x,trace.to.y]} stroke={trace.hits.length?'#b36c32':'#398561'} strokeWidth={2/view.scale} dash={[6/view.scale,4/view.scale]}/>{trace.hits.map(h=><Circle key={h.shapeId} x={h.point.x} y={h.point.y} radius={5/view.scale} fill="#b36c32"/>)}<Text x={trace.to.x+8} y={trace.to.y} text={node.data.label} fontSize={12/view.scale} fill="#536782"/></Group>;}catch{return null;}})}
      </Layer>
      <Layer listening={false}>{shapes.map(source=>{if(source.kind==='comment'||source.kind==='value'||source.kind==='text')return null;const shape=readShapeGeometry(document,source).shape;const center=source.centerPointId?readCircleCenter(document,source).position:{x:shape.x,y:shape.y};if(!center)return null;const participant=readPointEntity(document,source);const label=[...new Set([shape.labelVisible!==false?shape.name:'',participant.status==='resolved'&&participant.entity.labelVisible!==false?participant.entity.name:''].filter(Boolean))].join('\n');if(!label)return null;const position=dragPreview?.id===shape.id?dragPreview:center;const radius=radiusPreview?.id===shape.id?radiusPreview.radius:shape.radius;return <Text key={`label:${shape.id}`} text={label} x={position.x-65} y={position.y+(['circle','polygon','chart'].includes(shape.kind)?-radius-38:shape.kind==='rectangle'?-(shape.height??100)/2-38:-38)} fill="#333d46" fontSize={14} opacity={1-shape.transparency/100}/>;})}</Layer>
    </Stage>
    <div className="scene-value-layer" aria-label="Закреплённые значения">
      {shapes.filter(shape=>shape.kind==='value').map(shape=>{
        const parameter=document.parameters.find(item=>item.id===shape.displayParameterId);
        const result=shape.displayParameterId?readParameterValue(document,shape.displayParameterId):null;
        const position=displayPreview?.id===shape.id?displayPreview:legacyValuePositions.get(shape.id)??{x:shape.x,y:shape.y};
        const selected=selectedIds.includes(shape.id);
        return <div key={shape.id} className={`scene-value-card${selected?' selected':''}`} style={{left:position.x,top:position.y,opacity:1-shape.transparency/100}} role="group" aria-label={`Закреплённое значение: ${parameter?.name??'параметр удалён'}`}
          onPointerDown={event=>{if(event.button!==0||event.target instanceof Element&&event.target.closest('input'))return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);displayDrag.current={id:shape.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:position.x,y:position.y,moved:false};onSelect(shape.id,event.shiftKey||event.metaKey||event.ctrlKey);}}
          onPointerMove={event=>{const drag=displayDrag.current;if(!drag||drag.id!==shape.id||drag.pointerId!==event.pointerId)return;const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;drag.moved||=Math.hypot(dx,dy)>3;if(drag.moved)setDisplayPreview({id:shape.id,x:drag.x+dx,y:drag.y+dy});}}
          onPointerUp={event=>{const drag=displayDrag.current;if(!drag||drag.id!==shape.id||drag.pointerId!==event.pointerId)return;displayDrag.current=null;setDisplayPreview(null);if(drag.moved)onMove(shape.id,drag.x+event.clientX-drag.startX,drag.y+event.clientY-drag.startY);}}
          onPointerCancel={()=>{displayDrag.current=null;setDisplayPreview(null);}}>
          <span className="scene-value-label">{parameter?(shape.labelVisible===false?'':shape.name):'Параметр удалён'}</span>
          {liveInteraction?<DebugParameterInput label={parameter?.name??'Значение'} value={result?.status==='ready'&&typeof result.value==='number'?result.value:null} disabled={interactionLocked||!parameter||Boolean(parameter.sourceNodeId)} onChange={value=>{if(parameter)onDebugValue(parameter.id,value);}}/>:<output className={result?.status==='error'?'error':''}>{result?.status==='ready'?String(result.value):'—'}</output>}
        </div>;
      })}
    </div>
    {selectedId && !spacePressed && (()=>{const shape=shapes.find(s=>s.id===selectedId);if(!shape||shape.kind==='value')return null;const center=shape.centerPointId?readCircleCenter(document,shape).position:{x:shape.x,y:shape.y};if(!center)return null;const left=Math.max(8,Math.min(size.width-340,center.x*view.scale+view.x-160));const extent=(shape.kind==='rectangle'?(shape.height??100)/2:['circle','polygon','chart'].includes(shape.kind)?shape.radius:20)*view.scale;const centerY=center.y*view.scale+view.y;const above=centerY-extent-230;const below=centerY+extent+26;const top=above>=8?above:below<size.height-110?below:8;return <div className="scene-context" style={{left,top,maxHeight:Math.max(110,above>=8?200:size.height-top-8)}} aria-label="Свойства выбранной фигуры"><SceneInspector shape={shape} document={document} selectedIds={selectedIds} onCommand={onCommand}/></div>;})()}
    <div className="zoom-toolbar" aria-label="Масштаб холста">
      <IconButton icon="minus" label="Уменьшить холст" onClick={() => zoom(1 / 1.2)} />
      <output>{Math.round(view.scale * 100)}%</output>
      <IconButton icon="plus" label="Увеличить холст" onClick={() => zoom(1.2)} />
      <IconButton icon="fit" label="Вернуть исходный обзор" onClick={() => setView({ x: 0, y: 0, scale: 1 })} />
    </div>
    {radiusPreview && <span className="resize-hint">Радиус: {radiusPreview.radius.toFixed(2)} · Esc — отмена</span>}
  </div>;
}

function GeometryHandle({x,y,scale,label,color='#756dbb',onPreview,onCommit,onCancel}:{x:number;y:number;scale:number;label:string;color?:string;onPreview?:(x:number,y:number)=>void;onCommit:(x:number,y:number)=>void;onCancel?:()=>void}) {
 const cancelled=useRef(false),active=useRef<{stopDrag:()=>void;position:(p:{x:number;y:number})=>void}|null>(null);
 const initial=useRef({x,y});
 useEffect(()=>{const cancel=()=>{if(!active.current)return;cancelled.current=true;active.current.stopDrag();active.current.position(initial.current);active.current=null;onCancel?.();};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel();};window.addEventListener('keydown',key);window.addEventListener('blur',cancel);return ()=>{window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);};},[onCancel]);
 return <Group x={x} y={y} draggable onMouseDown={e=>{e.cancelBubble=true;}} onClick={e=>{e.cancelBubble=true;}} onDragStart={e=>{e.cancelBubble=true;cancelled.current=false;initial.current={x,y};active.current=e.target;}} onDragMove={e=>{e.cancelBubble=true;if(!cancelled.current)onPreview?.(e.target.x(),e.target.y());}} onDragEnd={e=>{e.cancelBubble=true;active.current=null;if(!cancelled.current)onCommit(e.target.x(),e.target.y());}}><Circle radius={6/scale} fill="white" stroke={color} strokeWidth={2/scale}/><Text listening={false} text={label} x={10/scale} y={-6/scale} fontSize={11/scale} fill={color}/></Group>;
}
