import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const cli = path.resolve('scripts/vigc.mjs');
function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('agent CLI creates, mutates, and inspects a project through engine commands', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vigc-agent-'));
  try {
    const project = path.join(dir, 'scene.json');
    const commands = path.join(dir, 'commands.json');
    assert.equal(run(['init', project, 'CLI scene']).status, 0);
    await writeFile(commands, JSON.stringify([
      { type: 'project.rename', name: 'Territory' },
      { type: 'shape.add', kind: 'rectangle', id: 'wall-1', position: { x: 20, y: 30 }, geometry: { width: 180, height: 28 } },
      { type: 'shape.add', kind: 'point', id: 'player', position: { x: 5, y: 30 } },
    ]));
    const applied = run(['apply', project, commands]);
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /"index":3/);
    const inspected = run(['inspect', project]);
    assert.equal(inspected.status, 0, inspected.stderr);
    const state = JSON.parse(inspected.stdout) as { document: { name: string; shapes: { id: string }[] } };
    assert.equal(state.document.name, 'Territory');
    assert.deepEqual(state.document.shapes.map(shape => shape.id), ['wall-1', 'player']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a rejected command preserves the last accepted project state', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vigc-agent-'));
  try {
    const project = path.join(dir, 'scene.json');
    const commands = path.join(dir, 'commands.json');
    assert.equal(run(['init', project]).status, 0);
    await writeFile(commands, JSON.stringify([
      { type: 'project.rename', name: 'Last good state' },
      { type: 'shape.update', id: 'missing', update: { x: 10 } },
    ]));
    const result = run(['apply', project, commands]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Команда 2 отклонена/);
    const saved = JSON.parse(await readFile(project, 'utf8')) as { document: { name: string; shapes: unknown[] } };
    assert.equal(saved.document.name, 'Last good state');
    assert.deepEqual(saved.document.shapes, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('behavior checks print transient runtime results without persisting them', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vigc-agent-'));
  try {
    const project = path.join(dir, 'scene.json');
    const commands = path.join(dir, 'commands.json');
    assert.equal(run(['init', project, 'Runtime scene']).status, 0);
    await writeFile(commands, JSON.stringify([{ type: 'behavior.check' }]));
    const applied = run(['apply', project, commands]);
    assert.equal(applied.status, 0, applied.stderr);
    const result = JSON.parse(applied.stdout) as { results: { runtime?: { parameters: unknown[]; events: unknown[]; results: object } }[] };
    assert.deepEqual(result.results[0].runtime, { parameters: [], events: [], results: {} });
    const saved = JSON.parse(await readFile(project, 'utf8')) as { document: Record<string, unknown> };
    assert.equal('behavior' in saved.document, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
