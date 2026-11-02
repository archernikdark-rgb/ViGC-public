import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,applyWorkspaceCommand} from '../../src/workspace/document.ts';
import {captureProject,restoreProject} from '../../src/persistence/project.ts';
import {createPlayback} from '../../src/engine/playback.ts';
test('editable geometry and anchors survive project boundary; malformed anchors rejected',()=>{
 let d=applyWorkspaceCommand(newDocument('base'),{type:'shape.add',id:'wall',kind:'rectangle',position:{x:10,y:20}});
 d=applyWorkspaceCommand(d,{type:'shape.update',id:'wall',update:{geometryLocked:true,collisionEnabled:false,anchors:[{id:'a',name:'Глаза',x:30,y:-10}]}});
 const saved=captureProject(d,createPlayback());assert.deepEqual(restoreProject(saved).document.shapes,d.shapes);
 saved.document.shapes[0].anchors![0].x=NaN;assert.throws(()=>restoreProject(saved));
});
