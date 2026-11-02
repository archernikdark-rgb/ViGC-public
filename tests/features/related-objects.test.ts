import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,applyWorkspaceCommand} from '../../src/workspace/document.ts';
import {relatedEntityIds,relatedShapeIds} from '../../src/workspace/related-objects.ts';
test('figure navigation includes direct ownership, followed center and parameter source without changing groups',()=>{
 let d=newDocument('related');
 d=applyWorkspaceCommand(d,{type:'entity.create',entity:{id:'npc',name:'NPC'},parameters:[{id:'hp',ownerId:'npc',name:'HP',value:50}]});
 for(const [id,kind] of [['point','point'],['zone','circle'],['chart','chart'],['wall','rectangle']] as const)d=applyWorkspaceCommand(d,{type:'shape.add',id,kind,position:{x:0,y:0}});
 d=applyWorkspaceCommand(d,{type:'shape.bind-entity',shapeId:'point',entityId:'npc'});
 d=applyWorkspaceCommand(d,{type:'circle.bind-center',circleId:'zone',pointId:'point'});
 d=applyWorkspaceCommand(d,{type:'reference.add',reference:{id:'hp-view',parameterId:'hp',target:{kind:'shape',id:'chart',property:'fillPercent'}}});
 const before=structuredClone(d);
 assert.deepEqual(relatedShapeIds(d,'npc'),['point','zone','chart']);
 assert.deepEqual(relatedEntityIds(d,'wall'),[]);
 assert.deepEqual(d,before);
});
