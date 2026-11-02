import {graphEvaluator} from './node-graph.ts';
import { spatialValue } from './spatial.ts';
import { calculateExpression, CalculationError } from './expression.ts';
import type { CalculationValue } from './expression.ts';
import type { WorkspaceDocument } from '../workspace/document.ts';

export type CalculationResult = { status: 'ready'; value: CalculationValue } | { status: 'error'; code: string; message: string };
export type CalculationSource = { kind: 'parameter' | 'node'; id: string };
export interface CalculationDefinition { expression: string; inputs: { id: string; alias: string }[] }
export const sourceKey = (source: CalculationSource) => `${source.kind}:${source.id}`;

export function evaluateWorkspace(document: WorkspaceDocument): Record<string, CalculationResult> {
  const results: Record<string, CalculationResult> = {};
  const visiting = new Set<string>();
  function visit(source: CalculationSource): CalculationResult {
    const key = sourceKey(source);
    if (results[key]) return results[key];
    if (visiting.has(key)) return { status: 'error', code: 'cycle', message: 'Циклическая зависимость. Измените источник или формулу.' };
    if (visiting.size >= 128) return { status: 'error', code: 'limit', message: 'Цепочка зависимостей длиннее 128. Разделите расчёт.' };
    visiting.add(key);
    try {
      let value: CalculationValue;
      if (source.kind === 'parameter') {
        const parameter = document.parameters.find(item => item.id === source.id);
        if (!parameter) throw new CalculationError('missing', 'Параметр-источник удалён. Выберите замену во входе формулы.');
        if (!parameter.sourceNodeId) value = parameter.value;
        else {
          value = requireValue({ kind: 'node', id: parameter.sourceNodeId });
          if (typeof value !== 'number') throw new CalculationError('type', 'Числовому параметру нужен один числовой результат. Выберите число вместо списка или условия.');
        }
      } else {
        const node = document.logic.nodes.find(item => item.id === source.id);
        if (!node) throw new CalculationError('missing', 'Блок-источник удалён. Выберите другую формулу или переменную.');
        if(node.data.graph)value=graphEvaluator(document).read(node.id);
        else if (node.data.role === 'variable') value = node.data.variableValue ?? 0;
        else if (node.data.role === 'read') {
          const reference = document.references.find(item => item.target.kind === 'logic-node' && item.target.id === node.id);
          if (!reference) throw new CalculationError('missing', 'Выберите параметр в блоке чтения.');
          value = requireValue({ kind: 'parameter', id: reference.parameterId });
        } else if (node.data.role === 'spatial') {
          if (!node.data.spatial) throw new CalculationError('incomplete','Настройте пространственный запрос.');
          const connectedShape=(handle:'origin'|'target',fallback:string|undefined)=>{
            const edge=document.logic.edges.find(e=>e.target===node.id&&e.targetHandle===handle);
            if(!edge)return fallback;
            const context=document.logic.nodes.find(n=>n.id===edge.source);
            const shape=document.shapes.find(s=>edge.sourceHandle===`shape:${s.id}`);
            if(context?.data.role!=='context'||!shape?.entityId||!context.data.contextEntityIds?.includes(shape.entityId)) throw new CalculationError('missing','Объект контекста удалён или больше не связан с сущностью.');
            return shape.id;
          };
          value = spatialValue(document,{...node.data.spatial,originId:connectedShape('origin',node.data.spatial.originId)??'',targetId:connectedShape('target',node.data.spatial.targetId)},id=>requireValue({kind:'parameter',id}));
        } else if (['calculate','condition','action','repeat'].includes(node.data.role)) {
          const calculation = node.data.calculation;
          if (!calculation) throw new CalculationError('incomplete', 'Задайте выражение блока вычисления.');
          const aliases = new Set<string>();
          for (const input of calculation.inputs) {
            if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(input.alias) || ['true', 'false', 'pi'].includes(input.alias) || aliases.has(input.alias)) throw new CalculationError('input', 'Имена входов должны быть уникальными и состоять из букв, цифр и _. Имена true, false, pi заняты.');
            aliases.add(input.alias);
          }
          value = calculateExpression(calculation.expression, alias => {
            const input = calculation.inputs.find(item => item.alias === alias);
            if (!input) throw new CalculationError('input', `Для «${alias}» не выбран вход. Добавьте его или исправьте выражение.`);
            const edges = document.logic.edges.filter(edge => edge.target === node.id && edge.targetHandle === input.id);
            if (edges.length !== 1) throw new CalculationError('missing', `Вход «${alias}»: подключите один провод от источника.`);
            const edge = edges[0]!;
            if (edge.sourceHandle?.startsWith('parameter:')) {
              const sourceNode=document.logic.nodes.find(n=>n.id===edge.source); const id=edge.sourceHandle.slice('parameter:'.length); const parameter=document.parameters.find(p=>p.id===id);
              if(sourceNode?.data.role==='event'){if(!parameter||sourceNode.data.event?.contextEntityId!==parameter.ownerId)throw new CalculationError('missing','Данные события недоступны.');const captured=document.behavior.events?.findLast(event=>event.eventId===sourceNode.id)?.values.find(value=>value.id===id);if(!captured)throw new CalculationError('missing','Событие ещё не произошло.');return captured.value;}
              if(sourceNode?.data.role!=='context'||!parameter||!sourceNode.data.contextEntityIds?.includes(parameter.ownerId)) throw new CalculationError('missing','Параметр контекста удалён или недоступен.');
              return requireValue({kind:'parameter',id});
            }
            if (edge.sourceHandle !== 'value') throw new CalculationError('input', `Вход «${alias}»: подключите выход значения.`);
            return requireValue({ kind: 'node', id: edge.source });
          });
        } else throw new CalculationError('type', 'Выберите вычисление или переменную схемы.');
      }
      if (source.kind === 'node' && document.logic.nodes.find(n=>n.id===source.id)?.data.role === 'condition' && typeof value !== 'boolean') throw new CalculationError('type','Условие должно возвращать true или false.');
      if (typeof value === 'number' && !Number.isFinite(value)) throw new CalculationError('domain', 'Результат должен быть конечным числом.');
      return results[key] = { status: 'ready', value };
    } catch (error) {
      return results[key] = { status: 'error', code: error instanceof CalculationError ? error.code : 'calculation', message: error instanceof Error ? error.message : 'Расчёт невозможен.' };
    } finally { visiting.delete(key); }
  }
  function requireValue(source: CalculationSource): CalculationValue {
    const result = visit(source);
    if (result.status === 'error') throw new CalculationError(result.code, `Источник недоступен: ${result.message}`);
    return result.value;
  }
  document.parameters.forEach(parameter => visit({ kind: 'parameter', id: parameter.id }));
  document.logic.nodes.filter(node => node.data.role === 'calculate' || node.data.role === 'variable' || node.data.role === 'read' || ['condition','action','repeat','spatial'].includes(node.data.role)).forEach(node => visit({ kind: 'node', id: node.id }));
  return results;
}

export function readParameterValue(document: WorkspaceDocument, id: string): CalculationResult {
  return document.evaluations[sourceKey({ kind: 'parameter', id })] ?? { status: 'error', code: 'missing', message: 'Параметр не найден.' };
}
