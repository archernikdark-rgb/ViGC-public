import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createEngineSession} from '../../src/engine/protocol.ts';
import type {EngineCommand,EngineResponse} from '../../src/engine/protocol.ts';
import {createPlayback} from '../../src/engine/playback.ts';
import {captureProject} from '../../src/persistence/project.ts';
import {graphEvaluator} from '../../src/engine/node-graph.ts';
import {newDocument,applyWorkspaceCommand} from '../../src/workspace/document.ts';
import {lessons,type LessonId} from '../../src/onboarding/scenarios.ts';
import {buildTrainingSheets,hasPlayableCard,trainingSheetNames} from '../../src/onboarding/workbooks.ts';
import {GoogleConnection,type GoogleGateway,type TrainingSheet} from '../../src/google/connection.ts';
import {exportLogicYaml,importLogicYaml} from '../../src/workspace/yaml-transfer.ts';

function send(session:(request:{type:'command';requestId:string;command:EngineCommand})=>EngineResponse,command:EngineCommand){
 const response=session({type:'command',requestId:crypto.randomUUID(),command});
 assert.equal(response.type,'updated',response.type==='rejected'?response.message:'Команда не обновила проект.');
 return response;
}

function applyLesson(session:(request:{type:'command';requestId:string;command:EngineCommand})=>EngineResponse,lesson:typeof lessons[number]){
 for(const step of lesson.steps){
  for(const command of step.commands??[])send(session,command);
  if(step.run&&!step.commands?.some(command=>command.type==='playback.play'))send(session,{type:'playback.play'});
  if(step.run){const duration=lesson.id==='combat'?6:lesson.id==='cards'?16:12,tickSeconds=lesson.id==='combat'?0.1:lesson.id==='detection'?0.25:1;for(let tick=0;tick<duration;tick++)send(session,{type:'playback.advance',seconds:tickSeconds});}
 }
}

for(const id of ['detection','combat','cards'] as LessonId[]){
 test(`${id} onboarding commands build in the Worker and training restores the user's project and history`,()=>{
  const session=createEngineSession(newDocument(`user-${id}`));
  send(session,{type:'entity.add',entity:{id:'user-entity',name:'Моя сущность'}});
  const original=session({type:'capture',requestId:'original'});assert.equal(original.type,'captured');if(original.type!=='captured')return;
  send(session,{type:'training.start',project:captureProject(newDocument(`lesson-${id}`),createPlayback()),modified:true});
  applyLesson(session,lessons.find(lesson=>lesson.id===id)!);
  const built=session({type:'ping',requestId:'built'});if(built.type==='ready')assert.ok(built.document.logic.nodes.every(n=>n.data.graph),'every lesson must use current typed nodes');
  const restored=send(session,{type:'training.end'});
  assert.equal(restored.type,'updated');
  if(restored.type==='updated'){
   assert.equal(restored.document.id,original.project.document.id);
   assert.equal(restored.document.entities.some(entity=>entity.id==='user-entity'),true);
   assert.equal(restored.document.modified,true);
   assert.deepEqual(restored.history,{undo:true,redo:false});
  }
  const undo=send(session,{type:'history.undo'});
  if(undo.type==='updated')assert.equal(undo.document.entities.some(entity=>entity.id==='user-entity'),false);
 });
}

test('detection walkthrough uses 17 typed nodes, crosses its shared threshold and exports valid YAML',()=>{
 const session=createEngineSession(newDocument('detection-user')),lesson=lessons.find(value=>value.id==='detection')!;
 for(const step of lesson.steps.slice(0,8))for(const command of step.commands??[])send(session,command);
 for(let i=0;i<3;i++)send(session,{type:'playback.advance',seconds:1});
 const state=session({type:'ping',requestId:'seen'});assert.equal(state.type,'ready');if(state.type!=='ready')return;
 assert.equal(state.document.logic.nodes.length,17);assert.ok(state.document.logic.nodes.every(n=>n.data.graph));
 assert.ok(state.playback.frame!.parameters.find(p=>p.id==='alert')!.value>50);assert.equal(state.playback.frame!.parameters.find(p=>p.id==='detected')!.value,1);
 send(session,{type:'debug.stop'});send(session,{type:'debug.start'});send(session,{type:'debug.move',id:'player-point',x:350,y:200});send(session,{type:'debug.parameter',id:'alert',value:75});send(session,{type:'debug.move',id:'player-point',x:300,y:200});
 let hidden=session({type:'ping',requestId:'hidden'});assert.equal(hidden.type,'ready');if(hidden.type!=='ready')return;assert.equal(hidden.playback.frame!.parameters.find(p=>p.id==='alert')!.value,75);
 send(session,{type:'debug.move',id:'player-point',x:1040,y:300});hidden=session({type:'ping',requestId:'outside'});if(hidden.type!=='ready')return;for(const [id,value]of [['alert',0],['detected',0],['safe',1]]as const)assert.equal(hidden.playback.frame!.parameters.find(p=>p.id===id)!.value,value);
 const yaml=exportLogicYaml(state.document,state.document.logic.nodes.map(n=>n.id));assert.match(yaml,/Игрок виден/);const imported=importLogicYaml(newDocument('yaml-destination'),yaml,'yaml-copy');assert.equal(imported.logic.nodes.length,17);assert.ok(imported.logic.nodes.every(n=>n.data.graph));
});
function combatLesson(through=6){const session=createEngineSession(newDocument('combat-user'));for(const step of lessons.find(l=>l.id==='combat')!.steps.slice(0,through))for(const c of step.commands??[])send(session,c);return session;}
function tickCombat(session:ReturnType<typeof combatLesson>,ticks:number){const state=session({type:'ping',requestId:crypto.randomUUID()});if(state.type==='ready'&&state.playback.status!=='playing')send(session,{type:'playback.play'});for(let i=0;i<ticks;i++)send(session,{type:'playback.advance',seconds:.1});send(session,{type:'playback.pause'});}
function combatValues(session:ReturnType<typeof combatLesson>){const r=session({type:'ping',requestId:crypto.randomUUID()});assert.equal(r.type,'ready');if(r.type!=='ready')throw Error();return new Map((r.playback.frame??r.document).parameters.map(p=>[p.id,p.value]));}
test('combat walkthrough uses the shown typed graph and demonstrates a timed parry',()=>{const session=combatLesson(7);tickCombat(session,6);assert.equal(combatValues(session).get('hp'),100);assert.equal(combatValues(session).get('stunned'),1);tickCombat(session,2);assert.equal(combatValues(session).get('stunned'),0);send(session,{type:'debug.stop'});send(session,{type:'debug.start'});send(session,{type:'debug.fire',nodeId:'light-button'});send(session,{type:'debug.fire',nodeId:'parry-button'});tickCombat(session,4);assert.equal(combatValues(session).get('hp'),90);});
test('combat lesson readiness rejects a second attack and allows parry during the response window',()=>{const session=combatLesson();send(session,{type:'debug.start'});send(session,{type:'debug.fire',nodeId:'light-button'});send(session,{type:'debug.fire',nodeId:'heavy-button'});assert.equal(combatValues(session).get('busy'),1);tickCombat(session,2);send(session,{type:'debug.fire',nodeId:'parry-button'});tickCombat(session,2);assert.equal(combatValues(session).get('hp'),100);assert.equal(combatValues(session).get('stunned'),1);});
test('combat lesson dodge protects only while its three-tick interval overlaps the hit',()=>{const early=combatLesson();send(early,{type:'debug.start'});send(early,{type:'debug.fire',nodeId:'heavy-button'});send(early,{type:'debug.fire',nodeId:'dodge-button'});tickCombat(early,9);assert.equal(combatValues(early).get('hp'),75);const timed=combatLesson();send(timed,{type:'debug.start'});send(timed,{type:'debug.fire',nodeId:'light-button'});tickCombat(timed,2);send(timed,{type:'debug.fire',nodeId:'dodge-button'});tickCombat(timed,2);assert.equal(combatValues(timed).get('hp'),100);});

test('card formulas use live model inputs and distinguish matching from non-matching colors',()=>{
 const session=createEngineSession(newDocument('cards'));
 send(session,{type:'training.start',project:captureProject(newDocument('lesson-cards'),createPlayback()),modified:false});
 const lesson=lessons.find(value=>value.id==='cards')!;
 for(const step of lesson.steps){for(const command of step.commands??[])send(session,command);}
 const captured=session({type:'ping',requestId:'cards-capture'});assert.equal(captured.type,'ready');if(captured.type!=='ready')return;
 const results=captured.document;
 const nodeValue=(id:string)=>results.logic.nodes.find(node=>node.id===id)!;
 assert.deepEqual(results.evaluations[`node:lesson-cards-match-color`],{status:'ready',value:2});
 assert.deepEqual(results.evaluations[`node:lesson-cards-damage-per-mana`],{status:'ready',value:1});
 assert.deepEqual(results.evaluations[`node:lesson-cards-attacks-to-kill`],{status:'ready',value:5});
 const match=results.parameters.find(parameter=>parameter.id==='lesson-cards-match-0')!;
 const after=send(session,{type:'parameter.update',id:match.id,update:{value:1}});
 assert.equal(after.type,'updated');if(after.type==='updated')assert.deepEqual(after.document.evaluations['node:lesson-cards-match-color'],{status:'ready',value:3});
 assert.deepEqual(after.type==='updated'?after.document.evaluations['node:lesson-cards-attacks-to-kill']:null,{status:'ready',value:4});
 send(session,{type:'playback.play'});for(let tick=0;tick<8;tick++)send(session,{type:'playback.advance',seconds:1});
 const timeline=session({type:'ping',requestId:'cards-timeline'});assert.equal(timeline.type,'ready');if(timeline.type!=='ready')return;
 assert.deepEqual(timeline.playback.frame?.evaluations['node:lesson-cards-match-color'],{status:'ready',value:3});
 assert.deepEqual(timeline.playback.frame?.evaluations['node:lesson-cards-attacks-to-kill'],{status:'ready',value:4});
 assert.ok(nodeValue('lesson-cards-match-color'));
});

test('training workbooks include named sheets, formulas, combat mechanics, and deterministic comparison runs',()=>{
 const combat=buildTrainingSheets('combat');assert.deepEqual(combat.map(sheet=>sheet.name),trainingSheetNames.slice(0,2));
 assert.match(String(combat[0]!.values[1]![1]),/^4$/);assert.match(String(combat[0]!.values[2]![3]),/^25$/);
 const cards=buildTrainingSheets('cards');assert.deepEqual(cards.map(sheet=>sheet.name),trainingSheetNames.slice(2));
 assert.match(String(cards[0]!.values[1]![6]),/^=/);assert.equal(cards[1]!.values.length,17);assert.ok(cards[2]!.values.some(row=>row[1]==='РЕЗУЛЬТАТ'));
 assert.equal(hasPlayableCard([6],5),false,'an unplayable reserve cannot postpone defeat');
 assert.equal(hasPlayableCard([5,6],5),true,'an affordable reserve card prevents defeat on an empty board');
 assert.match(String(cards[2]!.values[1]![1]),/доступная карта/);
});

test('training workbook connection creates, writes, reads back, and reuses one account file',async()=>{
 const calls:string[]=[],stored=new Map<string,TrainingSheet>();
 const gateway:GoogleGateway={
  async prepare(){calls.push('prepare');},
  async authorize(){calls.push('authorize');return {token:'training-token',expiresIn:3600};},
  async pick(){return null;},
  async inspect(_token,id){calls.push(`inspect:${id}`);return {id,name:'ViGC — учебная таблица',sheets:trainingSheetNames};},
  async createTrainingWorkbook(_token,title,sheets){calls.push(`create:${title}`);assert.deepEqual(sheets,trainingSheetNames);return {id:'training-sheet',name:title,sheets};},
  async writeTrainingSheets(_token,id,sheets){calls.push(`write:${id}`);for(const sheet of sheets)stored.set(sheet.name,structuredClone(sheet));},
  async readTrainingSheets(_token,id,names){calls.push(`read:${id}`);assert.deepEqual(names,['Бой — механики','Бой — система']);return names.map(name=>structuredClone(stored.get(name)!));},
  async revoke(){calls.push('revoke');},
 };
 const connection=new GoogleConnection({clientId:'client',apiKey:'key',appId:'app'},gateway,()=>1000);
 await connection.prepare();
 const workbook=await connection.createTrainingWorkbook('ViGC — учебная таблица',trainingSheetNames);
 const sheets=buildTrainingSheets('combat');
 await connection.writeTrainingSheets(workbook.id,sheets);
 const readback=await connection.readTrainingSheets(workbook.id,sheets.map(sheet=>sheet.name));
 assert.deepEqual(readback,sheets);
 const reused=await connection.inspectTrainingWorkbook(workbook.id);
 assert.deepEqual(reused,workbook);
 assert.deepEqual(calls,['prepare','authorize','create:ViGC — учебная таблица','write:training-sheet','read:training-sheet','inspect:training-sheet']);
});

test('exported zone output keys survive YAML and rebind to different scene object IDs',()=>{
 const session=createEngineSession(newDocument('source'));for(const step of lessons.find(l=>l.id==='detection')!.steps.slice(0,6))for(const c of step.commands??[])send(session,c);
 const state=session({type:'ping',requestId:'export'});if(state.type!=='ready')throw Error();const original=state.document;
 let imported=importLogicYaml(newDocument('destination'),exportLogicYaml(original,original.logic.nodes.map(n=>n.id)),'imported');
 assert.ok(imported.logic.nodes.flatMap(n=>n.data.graph?.fields??[]).every(f=>f.referenceId===''));
 imported={...imported,entities:original.entities,shapes:original.shapes.map(s=>({...s,id:'scene-'+s.id,...(s.centerPointId?{centerPointId:'scene-'+s.centerPointId}:{})})),parameters:original.parameters.map(p=>({...p,id:'data-'+p.id}))};
 for(const source of imported.logic.nodes.filter(n=>n.data.graph?.operation==='sources')){const previous=original.logic.nodes.find(n=>n.data.graph?.operation==='sources')!.data.graph!;imported=applyWorkspaceCommand(imported,{type:'graph.configure',id:source.id,definition:{...source.data.graph!,fields:source.data.graph!.fields!.map(f=>({...f,referenceId:(f.type==='number'?'data-':'scene-')+previous.fields!.find(x=>x.id===f.id)!.referenceId}))}});}
 imported=applyWorkspaceCommand(imported,{type:'shape.update',id:'scene-player-point',update:{x:350,y:200}});
 const zone=imported.logic.nodes.find(n=>n.data.graph?.operation==='inside')!,trace=imported.logic.nodes.find(n=>n.data.graph?.operation==='trace')!;const ev=graphEvaluator(imported);assert.equal(ev.read(zone.id,'area:territory'),true);assert.equal(ev.read(zone.id,'area:view-0'),true);assert.equal(ev.read(trace.id,'reached'),true);
});
