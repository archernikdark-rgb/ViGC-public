import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { isValidImportName, parseProjectFile, projectCopyForImport } from '../../src/persistence/importProject.ts';

const cli = path.resolve('scripts/vigc.mjs');

test('a CLI SavedProject is validated and copied with a fresh identity and chosen name', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vigc-import-'));
  try {
    const sourcePath = path.join(dir, 'scene.json');
    const created = spawnSync(process.execPath, [cli, 'init', sourcePath, 'CLI scenario'], { encoding: 'utf8' });
    assert.equal(created.status, 0, created.stderr);
    const applied = spawnSync(process.execPath, [cli, 'apply', sourcePath, '-'], {
      encoding: 'utf8',
      input: JSON.stringify({ type: 'shape.add', id: 'wall', kind: 'rectangle', position: { x: 20, y: 30 } }),
    });
    assert.equal(applied.status, 0, applied.stderr);

    const originalText = await readFile(sourcePath, 'utf8');
    const original = parseProjectFile(originalText);
    const copy = projectCopyForImport(original, '  Проверка импорта  ', 'browser-copy-id');

    assert.notEqual(copy.document.id, original.document.id);
    assert.equal(copy.document.id, 'browser-copy-id');
    assert.equal(copy.document.name, 'Проверка импорта');
    assert.deepEqual(copy.document.shapes.map(shape => shape.id), ['wall']);
    assert.equal(await readFile(sourcePath, 'utf8'), originalText);
    assert.equal(original.document.name, 'CLI scenario');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('invalid JSON and non ViGC JSON provide separate recovery guidance', () => {
  assert.throws(() => parseProjectFile('{'), /корректным JSON/);
  assert.throws(() => parseProjectFile('{"hello":"world"}'), /Выберите JSON, созданный CLI ViGC/);
  assert.equal(isValidImportName('   '), false);
  assert.equal(isValidImportName('Копия проекта'), true);
});
