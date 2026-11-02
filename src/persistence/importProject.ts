import { restoreProject } from './project.ts';
import type { SavedProject } from './project.ts';

export function parseProjectFile(source: string): SavedProject {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('Файл не является корректным JSON.');
  }

  try {
    restoreProject(value);
  } catch {
    throw new Error('Файл не распознан как проект ViGC. Выберите JSON, созданный CLI ViGC.');
  }

  return structuredClone(value) as SavedProject;
}

export function projectCopyForImport(project: SavedProject, name: string, id: string): SavedProject {
  const copy = structuredClone(project);
  copy.document.id = id;
  copy.document.name = name.trim() || project.document.name;
  restoreProject(copy);
  return copy;
}

export function isValidImportName(name: string): boolean {
  return name.trim().length > 0;
}
