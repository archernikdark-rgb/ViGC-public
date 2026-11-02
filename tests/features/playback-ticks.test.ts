import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPlayback,playbackCommand} from '../../src/engine/playback.ts';
import {createEngineSession} from '../../src/engine/protocol.ts';
import type {EngineCommand} from '../../src/engine/protocol.ts';
import {captureProject,restoreProject} from '../../src/persistence/project.ts';
import {applyWorkspaceCommand,newDocument} from '../../src/workspace/document.ts';
import type {WorkspaceDocument} from '../../src/workspace/document.ts';

function goRule():WorkspaceDocument {
 const document=newDocument('go-territory');
 document.entities=[{id:'black',name:'Чёрные'}];
 document.parameters=[{id:'hp',ownerId:'black',name:'Здоровье',value:100}];
 document.logic.nodes=[
  {id:'turn',type:'draft',position:{x:0,y:0},data:{role:'event',label:'Ход завершён',event:{trigger:'manual'}}},
  {id:'decay',type:'draft',position:{x:200,y:0},data:{role:'action',label:'Потеря здоровья',action:{operation:'rate',targetId:'hp',duration:5},calculation:{expression:'-2',inputs:[]}}},
 ];
 document.logic.edges=[{id:'turn-to-decay',source:'turn',sourceHandle:'then',target:'decay',targetHandle:'exec'}];
 return document;
}

test('rate effects use tick size and remain visible as a completed timeline range',()=>{
 const document=goRule();
 let playback=playbackCommand(document,createPlayback(),{type:'playback.duration',duration:5});
 playback=playbackCommand(document,playback,{type:'debug.start'});
 playback=playbackCommand(document,playback,{type:'debug.fire',nodeId:'turn'});
 playback=playbackCommand(document,playback,{type:'playback.play'});
 for(let i=0;i<5;i++)playback=playbackCommand(document,playback,{type:'playback.advance',seconds:1});
 assert.equal(playback.time,5);
 assert.equal(playback.frame?.parameters.find(value=>value.id==='hp')?.value,90);
 assert.deepEqual(playback.effects,[{targetId:'hp',rate:-2,duration:5,start:0}]);
 assert.equal(playback.rates.length,0);

 playback=playbackCommand(document,createPlayback(),{type:'playback.tick-size',seconds:0.5});
 playback=playbackCommand(document,playback,{type:'playback.duration',duration:5});
 playback=playbackCommand(document,playback,{type:'debug.start'});
 playback=playbackCommand(document,playback,{type:'debug.fire',nodeId:'turn'});
 playback=playbackCommand(document,playback,{type:'playback.play'});
 for(let i=0;i<5;i++)playback=playbackCommand(document,playback,{type:'playback.advance',seconds:0.5});
 assert.equal(playback.frame?.parameters.find(value=>value.id==='hp')?.value,95);
});

test('check mode edits and fires events on an isolated frame, then restores the authoring model',()=>{
 const document=goRule();
 let playback=playbackCommand(document,createPlayback(),{type:'debug.start'});
 assert.equal(playback.frame?.parameters[0]?.value,100);
 assert.equal(playback.rates.length,0,'manual events do not run merely by entering check mode');
 playback=playbackCommand(document,playback,{type:'debug.parameter',id:'hp',value:120});
 assert.equal(playback.frame?.parameters[0]?.value,120);
 assert.equal(document.parameters[0]?.value,100);
 playback=playbackCommand(document,playback,{type:'debug.fire',nodeId:'turn'});
 assert.equal(playback.effects.length,1);
 playback=playbackCommand(document,playback,{type:'snapshot.add',id:'test-key',name:'Проба'});
 playback=playbackCommand(document,playback,{type:'debug.stop'});
 assert.equal(playback.frame,null);
 assert.equal(playback.snapshots.length,1,'an explicitly saved key survives exiting the isolated mode');
 assert.equal(document.parameters[0]?.value,100);
});

test('entering check mode samples current conditions without firing them',()=>{
 const document=newDocument('debug-condition-baseline');
 document.entities=[{id:'player',name:'Игрок'}];
 document.parameters=[{id:'noise',ownerId:'player',name:'Уровень шума',value:0},{id:'detected',ownerId:'player',name:'Обнаружен',value:0}];
 document.logic.nodes=[
  {id:'noise-trigger',type:'draft',position:{x:0,y:0},data:{role:'event',label:'Шум услышан',event:{trigger:'condition',parameterId:'noise',threshold:0,comparison:'gte'}}},
  {id:'detect',type:'draft',position:{x:200,y:0},data:{role:'action',label:'Обнаружить игрока',action:{operation:'set',targetId:'detected'},calculation:{expression:'1',inputs:[]}}},
 ];
 document.logic.edges=[{id:'detect-edge',source:'noise-trigger',sourceHandle:'then',target:'detect',targetHandle:'exec'}];
 let playback=playbackCommand(document,createPlayback(),{type:'debug.start'});
 assert.equal(playback.frame?.parameters.find(parameter=>parameter.id==='detected')?.value,0);
 assert.equal(playback.frame?.behavior.inside['noise-trigger'],true,'the current condition is remembered as the baseline');
 playback=playbackCommand(document,playback,{type:'debug.parameter',id:'noise',value:-1});
 playback=playbackCommand(document,playback,{type:'debug.parameter',id:'noise',value:1});
 assert.equal(playback.frame?.parameters.find(parameter=>parameter.id==='detected')?.value,1,'the later false-to-true transition fires normally');
 assert.equal(document.parameters.find(parameter=>parameter.id==='detected')?.value,0,'check changes stay isolated');
});

test('moving a point in check mode evaluates area events without changing the authored scene',()=>{
 let document=newDocument('debug-area-movement');
 document=applyWorkspaceCommand(document,{type:'shape.add',kind:'point',id:'player-point',position:{x:0,y:0}});
 document=applyWorkspaceCommand(document,{type:'shape.add',kind:'circle',id:'hearing-area',position:{x:0,y:0},geometry:{radius:50}});
 document.entities=[{id:'player',name:'Игрок'}];
 document.parameters=[{id:'detected',ownerId:'player',name:'Обнаружен',value:0}];
 document.shapes=document.shapes.map(shape=>shape.id==='player-point'?{...shape,entityId:'player'}:shape);
 document.logic.nodes=[
  {id:'inside-event',type:'draft',position:{x:0,y:0},data:{role:'event',label:'В зоне слышимости',event:{trigger:'inside',pointId:'player-point',zoneId:'hearing-area'}}},
  {id:'detect',type:'draft',position:{x:200,y:0},data:{role:'action',label:'Обнаружить',action:{operation:'set',targetId:'detected'},calculation:{expression:'1',inputs:[]}}},
 ];
 document.logic.edges=[{id:'detect-edge',source:'inside-event',sourceHandle:'then',target:'detect',targetHandle:'exec'}];
 let playback=playbackCommand(document,createPlayback(),{type:'debug.start'});
 assert.equal(playback.frame?.parameters[0]?.value,0,'entering the zone already occupied at start does not fire');
 playback=playbackCommand(document,playback,{type:'debug.move',id:'player-point',x:100,y:100});
 assert.equal(playback.frame?.parameters[0]?.value,0);
 playback=playbackCommand(document,playback,{type:'debug.move',id:'player-point',x:10,y:10});
 assert.equal(playback.frame?.parameters[0]?.value,1,'moving into the zone evaluates its event');
 assert.equal(document.shapes.find(shape=>shape.id==='player-point')?.x,0,'runtime movement does not alter the authored scene');
});

test('an invalid event does not block other manual checks',()=>{
 let document=newDocument('debug-independent-event-error');
 document=applyWorkspaceCommand(document,{type:'shape.add',kind:'point',id:'player-point',position:{x:0,y:0}});
 document.logic.nodes=[{id:'broken-visibility',type:'draft',position:{x:0,y:0},data:{role:'event',label:'Неполная видимость',event:{trigger:'visibility'}}}];
 let playback=playbackCommand(document,createPlayback(),{type:'debug.start'});
 assert.equal(playback.status,'error','the event diagnosis stays visible');
 playback=playbackCommand(document,playback,{type:'debug.move',id:'player-point',x:40,y:20});
 assert.deepEqual(playback.frame?.shapes.find(shape=>shape.id==='player-point')&&{x:playback.frame.shapes.find(shape=>shape.id==='player-point')!.x,y:playback.frame.shapes.find(shape=>shape.id==='player-point')!.y},{x:40,y:20});
 assert.equal(playback.status,'error','the unrelated event error remains inspectable');
});

test('manual event calls are rejected in edit mode and stay in the check frame',()=>{
 const document=goRule(),session=createEngineSession(document);
 const command=(id:string,value:EngineCommand)=>session({type:'command',requestId:id,command:value});
 assert.equal(command('unsafe',{type:'behavior.fire',nodeId:'turn'}).type,'rejected');
 assert.equal(document.parameters[0]?.value,100);
 assert.equal(command('start',{type:'debug.start'}).type,'updated');
 assert.equal(command('fire',{type:'behavior.fire',nodeId:'turn'}).type,'updated');
 const captured=session({type:'capture',requestId:'capture'});
 assert.equal(captured.type,'captured');
 if(captured.type==='captured')assert.equal(captured.project.document.parameters[0]?.value,100);
});

test('version 2 projects migrate seconds to 1/30-second ticks and rename generated aliases',()=>{
 const document=goRule();
 document.paths=[{id:'path',name:'Камень',pointId:'stone',duration:2,points:[{x:0,y:0},{x:1,y:1}]}];
 document.logic.nodes.push({id:'calc',type:'draft',position:{x:0,y:100},data:{role:'calculate',label:'Урон',calculation:{expression:'a1 + 2',inputs:[{id:'in',alias:'a1'}]}}});
 const legacy=captureProject(document,createPlayback()) as any;
 legacy.version=2;legacy.playback.duration=2;legacy.playback.snapshots=[{id:'key',name:'P1',time:0.5,values:[],positions:[]}];
 legacy.playback.markers=[{id:'marker',name:'Событие',time:1,color:'green'}];
 legacy.document.logic.nodes.find((node:any)=>node.id==='decay').data.action.duration=0.5;
 const restored=restoreProject(legacy);
 assert.equal(restored.playback.tickSeconds,1/30);
 assert.equal(restored.playback.duration,60);
 assert.equal(restored.playback.snapshots[0]?.time,15);
 assert.equal(restored.playback.markers[0]?.time,30);
 assert.equal(restored.document.paths[0]?.duration,60);
 assert.equal(restored.document.logic.nodes.find(node=>node.id==='decay')?.data.action?.duration,15);
 const calculation=restored.document.logic.nodes.find(node=>node.id==='calc')?.data.calculation;
 assert.equal(calculation?.inputs[0]?.alias,'input_1');
 assert.equal(calculation?.expression,'input_1 + 2');
});
