import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateExpression } from '../../src/engine/expression.ts';
import { newDocument } from '../../src/workspace/document.ts';
import { evaluateWorkspace } from '../../src/engine/calculations.ts';

test('boolean spatial results can be compared in a condition expression', () => {
  assert.equal(calculateExpression('blocked == false', () => true), false);
  assert.equal(calculateExpression('blocked != false', () => true), true);
  assert.equal(calculateExpression('blocked == true', () => true), true);
  assert.throws(() => calculateExpression('blocked == 0', () => true), /Сравнивайте true\/false/);
});

test('condition inputs preserve a boolean spatial result through a visible data wire', () => {
  const document = newDocument('boolean-condition');
  document.shapes = [
    { id: 'guard', kind: 'point', name: 'Охранник', x: 0, y: 0, radius: 4, color: '#000', transparency: 0 },
    { id: 'player', kind: 'point', name: 'Игрок', x: 20, y: 0, radius: 4, color: '#000', transparency: 0 },
  ];
  document.sceneGroups = [{ id: 'targets', name: 'Препятствия', shapeIds: [] }];
  document.logic.nodes = [
    { id: 'sight', type: 'draft', position: { x: 0, y: 0 }, data: { role: 'spatial', label: 'Проверка линии', spatial: { operation: 'trace', originId: 'guard', groupId: 'targets', angle: 0, range: 100, output: 'blocked' } } },
    { id: 'condition', type: 'draft', position: { x: 0, y: 0 }, data: { role: 'condition', label: 'Есть видимость', calculation: { expression: 'blocked == false', inputs: [{ id: 'blocked-input', alias: 'blocked' }] } } },
  ];
  document.logic.edges = [{ id: 'wire', source: 'sight', target: 'condition', sourceHandle: 'value', targetHandle: 'blocked-input' }];
  assert.deepEqual(evaluateWorkspace(document)['node:condition'], { status: 'ready', value: true });
});

test('formula inputs can use readable Cyrillic names',()=>{
 const document=newDocument('readable-input');
 document.logic.nodes=[
  {id:'damage-source',type:'draft',position:{x:0,y:0},data:{role:'variable',label:'Урон',variableValue:12}},
  {id:'calculation',type:'draft',position:{x:200,y:0},data:{role:'calculate',label:'Итоговый урон',calculation:{expression:'урон * 2',inputs:[{id:'damage',alias:'урон'}]}}},
 ];
 document.logic.edges=[{id:'damage-wire',source:'damage-source',sourceHandle:'value',target:'calculation',targetHandle:'damage'}];
 assert.deepEqual(evaluateWorkspace(document)['node:calculation'],{status:'ready',value:24});
});
