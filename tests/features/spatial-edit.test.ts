import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,applyWorkspaceCommand} from '../../src/workspace/document.ts';
import {traceShapes,containsPoint,anchorPosition} from '../../src/engine/scene-geometry.ts';
const wall={id:'wall',kind:'rectangle' as const,name:'Стена',x:100,y:0,width:20,height:80,radius:90,color:'#555',transparency:0};
test('wall contour blocks a trace; a wall behind the endpoint does not',()=>{
 assert.equal(traceShapes([wall],{x:0,y:0},{x:200,y:0})[0]?.distance,90);
 assert.equal(traceShapes([wall],{x:0,y:0},{x:80,y:0}).length,0);
 assert.equal(traceShapes([{...wall,rotation:90}],{x:0,y:0},{x:200,y:0})[0]?.distance,60);
});
test('sector presence respects aperture, hole and rotation',()=>{
 const sector={...wall,kind:'chart' as const,x:0,y:0,radius:100,innerRadius:20,fillPercent:25,rotation:90};
 assert.equal(containsPoint(sector,{x:50,y:20}),true);
 assert.equal(containsPoint(sector,{x:-50,y:20}),false);
 assert.equal(containsPoint(sector,{x:1,y:1}),false);
});
test('a named anchor follows translation and rotation',()=>{
 assert.deepEqual(anchorPosition({...wall,rotation:90,anchors:[{id:'eyes',name:'Глаза',x:10,y:0}]},'eyes'),{x:100,y:10});
});
test('draw geometry, duplicate, group and move keep independent shapes',()=>{
 let d=newDocument('test');
 d=applyWorkspaceCommand(d,{type:'shape.add',id:'wall',kind:'rectangle',position:{x:100,y:50},geometry:{width:30,height:120}});
 d=applyWorkspaceCommand(d,{type:'scene.duplicate',shapeIds:['wall'],copyId:'copy'});
 assert.equal(d.shapes.length,2);assert.equal(d.shapes[1].width,30);
 d=applyWorkspaceCommand(d,{type:'scene.group',id:'walls',name:'Стены',shapeIds:d.shapes.map(s=>s.id)});
 d=applyWorkspaceCommand(d,{type:'shape.update',id:'wall',update:{x:150,y:50}});
 assert.equal(d.shapes[1].x,174);
});
import {spatialValue,spatialTrace} from '../../src/engine/spatial.ts';
test('trace stops at first or chosen object and reports ordered contacts',()=>{
 const d=newDocument('trace');d.shapes=[{...wall,id:'origin',kind:'point',x:0},{...wall,id:'wall',x:100},{...wall,id:'player',kind:'point',x:200}];d.sceneGroups=[{id:'all',name:'Объекты',shapeIds:['wall','player']}];
 const query={operation:'trace' as const,originId:'origin',groupId:'all',angle:0,range:300};
 assert.deepEqual(spatialTrace(d,query,()=>0).hits.map(h=>h.shapeId),['wall']);
 assert.deepEqual(spatialTrace(d,{...query,stopMode:'object',stopId:'player'},()=>0).hits.map(h=>h.shapeId),['wall','player']);
 assert.equal(spatialValue(d,{...query,stopMode:'object',stopId:'player',output:'count'},()=>0),2);
 assert.equal(spatialTrace(d,{...query,range:50},()=>0).stopped,false);
 d.shapes[1].collisionEnabled=false;assert.equal(spatialTrace(d,query,()=>0).hits[0].shapeId,'player');
});
test('presence uses rectangle and bound dimensions, not an invisible circular proxy',()=>{
 const d=newDocument('binding');d.shapes=[{...wall},{...wall,id:'p',kind:'point',x:130,y:0}];d.parameters=[{id:'width',ownerId:'e',name:'Ширина',value:80}];d.references=[{id:'r',parameterId:'width',target:{kind:'shape',id:'wall',property:'width'}}];
 assert.equal(spatialValue(d,{operation:'inside',originId:'p',targetId:'wall'},()=>80),true);
 assert.equal(spatialValue(d,{operation:'inside',originId:'p',targetId:'wall'},()=>20),false);
});
test('an empty chart is not a hidden collision area',()=>{
 const empty={...wall,kind:'chart' as const,x:0,y:0,radius:100,innerRadius:0,fillPercent:0};assert.equal(containsPoint(empty,{x:0,y:-50}),false);assert.equal(traceShapes([empty],{x:0,y:-200},{x:0,y:200}).length,0);
});
test('a chart can follow an actor point while retaining its contour',()=>{
 let d=newDocument('follow');for(const [id,kind]of [['p','point'],['s','chart']]as const)d=applyWorkspaceCommand(d,{type:'shape.add',id,kind,position:{x:10,y:20}});
 d=applyWorkspaceCommand(d,{type:'circle.bind-center',circleId:'s',pointId:'p'});
 d=applyWorkspaceCommand(d,{type:'shape.update',id:'p',update:{x:100,y:200}});
 assert.deepEqual(spatialValue(d,{operation:'position',originId:'s'},()=>0),[100,200]);
});
test('copying a followed figure alone detaches its position; whole group copies remain grouped',()=>{
 let d=newDocument('copy');for(const [id,kind]of [['p','point'],['s','chart']]as const)d=applyWorkspaceCommand(d,{type:'shape.add',id,kind,position:{x:10,y:20}});
 d=applyWorkspaceCommand(d,{type:'circle.bind-center',circleId:'s',pointId:'p'});
 d=applyWorkspaceCommand(d,{type:'scene.duplicate',shapeIds:['s'],copyId:'solo'});assert.equal(d.shapes[2].centerPointId,undefined);assert.equal(d.shapes[2].x,34);
 d=applyWorkspaceCommand(d,{type:'scene.group',id:'g',name:'Пара',shapeIds:['p','s']});d=applyWorkspaceCommand(d,{type:'scene.duplicate',shapeIds:['p','s'],copyId:'pair'});assert.equal(d.sceneGroups.length,2);assert.deepEqual(d.sceneGroups[1].shapeIds,['pair-0','pair-1']);
});
test('changing a spatial operation updates its generated name but preserves a custom one',()=>{
 let d=newDocument('name');d.logic.nodes=[{id:'n',type:'draft',position:{x:0,y:0},data:{role:'spatial',label:'Перекрытие',spatial:{operation:'raycast',originId:''}}}];
 d=applyWorkspaceCommand(d,{type:'behavior.configure',nodeId:'n',configuration:{spatial:{operation:'trace',originId:''}}});assert.equal(d.logic.nodes[0].data.label,'Проверка лучом');
 d.logic.nodes[0].data.label='Перекрытие';d=applyWorkspaceCommand(d,{type:'behavior.configure',nodeId:'n',configuration:{spatial:{operation:'trace',originId:'',angle:32.5}}});assert.equal(d.logic.nodes[0].data.label,'Проверка лучом');
 d=applyWorkspaceCommand(d,{type:'logic.rename',id:'n',name:'Моя проверка'});d=applyWorkspaceCommand(d,{type:'behavior.configure',nodeId:'n',configuration:{spatial:{operation:'position',originId:''}}});assert.equal(d.logic.nodes[0].data.label,'Моя проверка');
});
