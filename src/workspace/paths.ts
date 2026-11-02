import type { WorkspaceDocument } from './document.ts';
export interface PointSample { x: number; y: number }
export interface RecordedPath { id: string; name: string; pointId: string; points: PointSample[]; duration: number }
export interface RecordingDraft { pointId: string; originalPositions: { id: string; x: number; y: number }[]; points: PointSample[] }
export function beginRecording(document: WorkspaceDocument, pointId: string): RecordingDraft {
  if (document.recording) throw new Error('Сначала завершите или отмените текущую запись.');
  const point = document.shapes.find(s => s.id === pointId && s.kind === 'point');
  if (!point) throw new Error('Для записи выберите существующую точку.');
  return { pointId, originalPositions: document.shapes.map(({id,x,y}) => ({id,x,y})), points: [{x:point.x,y:point.y}] };
}
export function sampleRecording(recording: RecordingDraft | null, shapes: WorkspaceDocument['shapes']): RecordingDraft | null {
  if (!recording) return null;
  const point = shapes.find(s => s.id === recording.pointId)!;
  const last = recording.points.at(-1)!;
  if (point.x === last.x && point.y === last.y) return recording;
  if (recording.points.length >= 4096) throw new Error('Запись достигла 4096 точек. Завершите или отмените её.');
  return { ...recording, points: [...recording.points,{x:point.x,y:point.y}] };
}
