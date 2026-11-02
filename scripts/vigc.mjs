#!/usr/bin/env node
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createEngineSession } from '../src/engine/protocol.ts';
import { newDocument } from '../src/workspace/document.ts';

const help = `ViGC local command line

Usage:
  vigc init <project.json> [name]
  vigc inspect <project.json>
  vigc apply <project.json> <command.json | ->
  vigc help

apply accepts one engine command or a JSON array of commands. Use - to read
JSON from stdin. Each accepted command is saved immediately; a rejected
command leaves the last accepted project on disk. Commands follow the same
EngineCommand contract as the application. behavior.check and behavior.fire also print their
transient parameter values and execution results; those are not saved.`;

async function readJson(path) {
  const raw = path === '-' ? await readStdin() : await readFile(resolve(path), 'utf8');
  return JSON.parse(raw);
}

async function readStdin() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function saveAtomic(path, value) {
  const target = resolve(path);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temp, target);
}

function restoredSession(saved) {
  const session = createEngineSession();
  const response = session({ type: 'command', requestId: 'restore', command: { type: 'project.restore', project: saved } });
  if (response.type !== 'updated') throw new Error(response.message);
  return session;
}

function capture(session) {
  const response = session({ type: 'capture', requestId: 'capture' });
  if (response.type !== 'captured') throw new Error(response.message);
  return response.project;
}

async function main(args) {
  const [action, file, ...rest] = args;
  if (!action || action === 'help' || action === '--help') return console.log(help);
  if (action === 'init') {
    if (!file) throw new Error('Укажите путь к новому JSON-проекту.');
    const doc = newDocument();
    doc.name = rest.join(' ') || 'Новый проект';
    const session = createEngineSession(doc);
    await saveAtomic(file, capture(session));
    return console.log(JSON.stringify({ ok: true, path: resolve(file), id: doc.id, name: doc.name }));
  }
  if (action === 'inspect') {
    if (!file) throw new Error('Укажите JSON-проект.');
    const session = restoredSession(await readJson(file));
    const response = session({ type: 'ping', requestId: 'inspect' });
    if (response.type !== 'ready') throw new Error('Не удалось прочитать проект.');
    return console.log(JSON.stringify({ document: response.document, playback: response.playback }, null, 2));
  }
  if (action === 'apply') {
    if (!file || !rest[0]) throw new Error('Укажите JSON-проект и файл команд (или - для stdin).');
    const session = restoredSession(await readJson(file));
    const input = await readJson(rest[0]);
    const commands = Array.isArray(input) ? input : [input];
    const results = [];
    for (const [index, command] of commands.entries()) {
      const response = session({ type: 'command', requestId: String(index + 1), command });
      if (response.type === 'rejected') {
        await saveAtomic(file, capture(session));
        throw new Error(`Команда ${index + 1} отклонена; сохранено состояние после ${results.length} команд: ${response.message}`);
      }
      const result = { index: index + 1, type: response.type, revision: response.document.revision };
      if (command.type === 'behavior.check' || command.type === 'behavior.fire' || command.type.startsWith('debug.') || command.type.startsWith('playback.')) {
        const frame=response.playback.frame??response.document;
        result.runtime = {
          graph: frame.behavior.graph,
          parameters: frame.parameters.map(parameter => ({ id: parameter.id, name: parameter.name, value: parameter.value })),
          events: response.document.logic.nodes
            .filter(node => node.data.role === 'event')
            .map(node => ({ id: node.id, name: node.data.label, ...(response.document.behavior.results[node.id] ?? {}) })),
          results: frame.behavior.results,
        };
      }
      results.push(result);
      await saveAtomic(file, capture(session));
    }
    return console.log(JSON.stringify({ ok: true, results }));
  }
  throw new Error(`Неизвестная команда «${action}». Используйте vigc help.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
