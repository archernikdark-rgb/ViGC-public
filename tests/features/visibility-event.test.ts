import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newDocument,applyWorkspaceCommand} from '../../src/workspace/document.ts';
import {checkEvents} from '../../src/engine/behavior.ts';

function visibilityScene(blocked:boolean){
 let d=newDocument('visibility');
 d.entities=[{id:'observer',name:'Наблюдатель'},{id:'player',name:'Игрок'}];
 d.parameters=[{id:'attention',ownerId:'observer',name:'Бдительность',value:0}];
 d.shapes=[
  {id:'observer-point',kind:'point',name:'Наблюдатель',x:0,y:0,radius:7,color:'#000',transparency:0,entityId:'observer'},
  {id:'player-point',kind:'point',name:'Игрок',x:-100,y:0,radius:7,color:'#000',transparency:0,entityId:'player'},
  {id:'view',kind:'chart',name:'Сектор',x:0,y:0,radius:150,innerRadius:0,fillPercent:50,rotation:180,color:'#000',transparency:0},
 ];
 if(blocked)d.shapes.push({id:'wall',kind:'rectangle',name:'Стена',x:-50,y:0,width:15,height:50,radius:1,color:'#000',transparency:0});
 d.sceneGroups=blocked?[{id:'walls',name:'Преграды',shapeIds:['wall']}]:[{id:'walls',name:'Преграды',shapeIds:[]}];
 d.logic.nodes=[
  {id:'seen',type:'draft',position:{x:0,y:0},data:{role:'event',label:'Цель видна',event:{trigger:'visibility',observerId:'observer-point',targetId:'player-point',zoneId:'view',obstacleGroupId:'walls'}}},
  {id:'add',type:'draft',position:{x:0,y:0},data:{role:'action',label:'Накопить внимание',action:{operation:'add',targetId:'attention'},calculation:{expression:'6.25',inputs:[]}}},
  {id:'found',type:'draft',position:{x:0,y:0},data:{role:'event',label:'Обнаружен',event:{trigger:'condition',parameterId:'attention',threshold:50,comparison:'gt'}}},
 ];
 d.logic.edges=[{id:'reaction',source:'seen',sourceHandle:'then',target:'add',targetHandle:'exec'}];
 return d;
}

test('visibility event accumulates only in the view sector with a clear line',()=>{
 const hidden=checkEvents(visibilityScene(true));
 assert.equal(hidden.parameters[0].value,0);
 assert.equal(hidden.behavior.inside.seen,false);
 const visible=checkEvents(visibilityScene(false));
 assert.equal(visible.parameters[0].value,6.25);
 assert.equal(visible.behavior.inside.seen,true);
});

test('visibility drops when the target leaves the sector; strict threshold crosses only above fifty',()=>{
 let d=visibilityScene(false);
 d.parameters[0]={...d.parameters[0],value:50};
 assert.equal(checkEvents(d).behavior.inside.found,false);
 d.parameters[0]={...d.parameters[0],value:50.01};
 assert.equal(checkEvents(d).behavior.inside.found,true);
 d.shapes=d.shapes.map(shape=>shape.id==='player-point'?{...shape,x:1000}:shape);
 d=checkEvents(d);
 assert.equal(d.behavior.inside.seen,false);
 assert.equal(d.parameters[0].value,50.01);
});

test('visibility settings and reactions survive actual commands and YAML without external object bindings',async()=>{
 const {exportLogicYaml,importLogicYaml}=await import('../../src/workspace/yaml-transfer.ts');
 let d=visibilityScene(false);
 const graph=d.logic;
 d=applyWorkspaceCommand(d,{type:'logic.replace',logic:graph});
 const yaml=exportLogicYaml(d,['seen','add']);
 const imported=importLogicYaml(newDocument('copy'),yaml,'copy');
 const seen=imported.logic.nodes.find(node=>node.data.label==='Цель видна')!;
 assert.equal(seen.data.event?.trigger,'visibility');
 assert.equal(seen.data.event?.observerId,undefined);
 assert.equal(imported.logic.edges.length,1);
});
