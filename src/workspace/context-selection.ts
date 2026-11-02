import type { WorkspaceDocument } from './document.ts';

type Selection = { kind: 'shapes' | 'entities' | 'logic' | 'groups'; ids: string[] };
type Source = { entities: Pick<WorkspaceDocument['entities'][number], 'id' | 'folder'>[]; shapes: Pick<WorkspaceDocument['shapes'][number], 'id' | 'entityId'>[] };

export function contextEntitiesFromSelection(document: Source, selection: Selection): { entityIds: string[]; error?: string } {
  if (!selection.ids.length || !['shapes', 'entities'].includes(selection.kind)) return { entityIds: [], error: 'Выберите сущности или связанные объекты.' };
  const ids = selection.kind === 'entities' ? selection.ids : selection.ids.map(id => document.shapes.find(shape => shape.id === id)?.entityId);
  if (ids.some(id => !id || !document.entities.some(entity => entity.id === id))) return { entityIds: [], error: 'Свяжите все выбранные объекты с сущностями.' };
  if (ids.some(id => document.entities.find(entity => entity.id === id)?.folder)) return { entityIds: [], error: 'Выберите сущности, а не папки.' };
  return { entityIds: [...new Set(ids as string[])] };
}
