import type {GraphReference} from './node-graph.ts';
export type CalculationValue = number | boolean | number[] | GraphReference;
export class CalculationError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'CalculationError'; this.code = code; }
}

export type Expression =
  | { kind: 'number'; value: number }
  | { kind: 'name'; name: string }
  | { kind: 'array'; items: Expression[] }
  | { kind: 'unary'; operator: string; operand: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }
  | { kind: 'call'; name: string; args: Expression[] };

function fail(code: string, message: string): never { throw new CalculationError(code, message); }
function finite(value: number): number {
  if (!Number.isFinite(value)) fail('domain', 'Результат не является конечным действительным числом.');
  return value;
}
function number(value: CalculationValue): number {
  if (typeof value !== 'number') fail('type', 'Ожидалось одно число.');
  return finite(value);
}
function boolean(value: CalculationValue): boolean {
  if (typeof value !== 'boolean') fail('type', 'В условии ожидается сравнение или логическое значение.');
  return value;
}
const precedence: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 3, '>': 3, '<=': 3, '>=': 3, '+': 4, '-': 4, '*': 5, '/': 5, '^': 7 };

export function parseExpression(expression: string): Expression {
  if (expression.length > 4096) fail('limit', 'Выражение длиннее 4096 символов. Разделите его на блоки.');
  const tokens: string[] = [];
  let offset = 0;
  while (offset < expression.length) {
    const rest = expression.slice(offset);
    const match = /^(\s+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[\p{L}_][\p{L}\p{N}_]*|<=|>=|==|!=|&&|\|\||[+\-*/^%<>!(),\[\]])/u.exec(rest);
    if (!match) fail('syntax', `Недопустимый символ в позиции ${offset + 1}.`);
    offset += match[0].length;
    if (match[0].trim()) tokens.push(match[0]);
  }
  let cursor = 0;
  let depth = 0;
  const consume = (token: string) => {
    if (tokens[cursor++] !== token) fail('syntax', `Ожидался символ «${token}».`);
  };
  function list(close: string): Expression[] {
    const items: Expression[] = [];
    if (tokens[cursor] !== close) {
      do { items.push(read(0)); } while (tokens[cursor] === ',' && ++cursor);
    }
    consume(close);
    return items;
  }
  function read(minimum: number): Expression {
    if (++depth > 128) fail('limit', 'Слишком глубокое выражение. Разделите его на блоки.');
    const token = tokens[cursor++];
    let left: Expression;
    if (!token) fail('syntax', 'Выражение не закончено. Ожидалось число, вход или функция.');
    if (token === '-' || token === '+' || token === '!') left = { kind: 'unary', operator: token, operand: read(6) };
    else if (token === '(') { left = read(0); consume(')'); }
    else if (token === '[') left = { kind: 'array', items: list(']') };
    else if (/^(?:\d|\.)/.test(token)) left = { kind: 'number', value: finite(Number(token)) };
    else if (/^[\p{L}_]/u.test(token)) {
      if (tokens[cursor] === '(') { cursor++; left = { kind: 'call', name: token, args: list(')') }; }
      else left = { kind: 'name', name: token };
    } else fail('syntax', `Неожиданный символ «${token}».`);
    while(tokens[cursor]==='%'){cursor++;left={kind:'binary',operator:'/',left,right:{kind:'number',value:100}};}
    while (tokens[cursor] && (precedence[tokens[cursor]!] ?? -1) >= minimum) {
      const operator = tokens[cursor++]!;
      const priority = precedence[operator]!;
      left = { kind: 'binary', operator, left, right: read(operator === '^' ? priority : priority + 1) };
    }
    depth--;
    return left;
  }
  const result = read(0);
  if (cursor !== tokens.length) fail('syntax', `Лишний символ «${tokens[cursor]}».`);
  return result;
}

export function calculateExpression(expression: string, resolve: (name: string) => CalculationValue): CalculationValue {
  const root = parseExpression(expression);
  function evaluate(node: Expression): CalculationValue {
    if (node.kind === 'number') return node.value;
    if (node.kind === 'name') {
      if (node.name === 'true') return true;
      if (node.name === 'false') return false;
      if (node.name === 'pi') return Math.PI;
      return resolve(node.name);
    }
    if (node.kind === 'array') return node.items.map(item => number(evaluate(item)));
    if (node.kind === 'unary') {
      const operand = evaluate(node.operand);
      return node.operator === '!' ? !boolean(operand) : node.operator === '-' ? -number(operand) : number(operand);
    }
    if (node.kind === 'binary') {
      const left = evaluate(node.left);
      if (node.operator === '&&') return boolean(left) && boolean(evaluate(node.right));
      if (node.operator === '||') return boolean(left) || boolean(evaluate(node.right));
      if (node.operator === '==' || node.operator === '!=') {
        const right = evaluate(node.right);
        if (typeof left === 'boolean' || typeof right === 'boolean') {
          if (typeof left !== 'boolean' || typeof right !== 'boolean') fail('type', 'Сравнивайте true/false с true/false.');
          return node.operator === '==' ? left === right : left !== right;
        }
        const a = number(left), b = number(right);
        return node.operator === '==' ? a === b : a !== b;
      }
      const a = number(left);
      const b = number(evaluate(node.right));
      switch (node.operator) {
        case '+': return finite(a + b);
        case '-': return finite(a - b);
        case '*': return finite(a * b);
        case '/': if (b === 0) fail('division-zero', 'Деление на ноль. Измените знаменатель.'); return finite(a / b);
        case '^': return finite(a ** b);
        case '<': return a < b;
        case '>': return a > b;
        case '<=': return a <= b;
        case '>=': return a >= b;
      }
      return fail('syntax', 'Неизвестная операция.');
    }
    if (node.name === 'if') {
      if (node.args.length !== 3) fail('arguments', 'if требует условие, результат при истине и результат при лжи.');
      return evaluate(node.args[boolean(evaluate(node.args[0]!)) ? 1 : 2]!);
    }
    const args = node.args.map(evaluate);
    const vector = (value: CalculationValue | undefined): [number,number] => {
      if (!Array.isArray(value) || value.length !== 2) return fail('type','Ожидался вектор [x,y].');
      return [number(value[0]!),number(value[1]!)];
    };
    if (['abs','sqrt','sin','cos','atan2','ceil','floor'].includes(node.name)) {
      if (args.length !== (node.name === 'atan2'?2:1)) fail('arguments','Проверьте количество аргументов математической функции.');
      const a = number(args[0]!);
      return finite(node.name==='ceil'?Math.ceil(a):node.name==='floor'?Math.floor(a):node.name === 'abs'?Math.abs(a):node.name === 'sqrt'?Math.sqrt(a):node.name === 'sin'?Math.sin(a):node.name === 'cos'?Math.cos(a):Math.atan2(a,number(args[1]!)));
    }
    if (['vec','x','y','length','normalize','scale','vadd','vsub','dot'].includes(node.name)) {
      const arity = ['vec','scale','vadd','vsub','dot'].includes(node.name) ? 2 : 1;
      if (args.length !== arity) fail('arguments',`Функция ${node.name} требует аргументов: ${arity}.`);
      if (node.name === 'vec') return [number(args[0]!),number(args[1]!)];
      const a = vector(args[0]);
      if (node.name === 'x') return a[0];
      if (node.name === 'y') return a[1];
      const length = finite(Math.hypot(...a));
      if (node.name === 'length') return length;
      if (node.name === 'normalize') return length === 0 ? [0,0] : a.map(v=>finite(v/length));
      if (node.name === 'scale') return a.map(v=>finite(v*number(args[1]!)));
      const b = vector(args[1]);
      if (node.name === 'dot') return finite(a[0]*b[0]+a[1]*b[1]);
      return a.map((v,index)=>finite(node.name === 'vadd'?v+b[index]!:v-b[index]!));
    }

    if (node.name === 'arithmetic' || node.name === 'geometric') {
      if (args.length !== 3) fail('arguments', 'Прогрессия требует первый член, шаг/множитель и количество членов.');
      const [first, increment, count] = args.map(number) as [number, number, number];
      if (!Number.isInteger(count) || count < 1 || count > 10000) fail('arguments', 'Количество членов прогрессии: целое число от 1 до 10000.');
      return Array.from({ length: count }, (_, index) => finite(node.name === 'arithmetic' ? first + increment * index : first * increment ** index));
    }
    const values = args.flatMap(value => Array.isArray(value) ? value : [number(value)]);
    if (values.length === 0) fail('empty', 'Выборка пуста. Добавьте хотя бы одно число.');
    if (values.length > 10000) fail('limit', 'Выборка больше 10000 чисел. Уменьшите её.');
    const total = () => finite(values.reduce((sum, value) => sum + value, 0));
    switch (node.name) {
      case 'min': return Math.min(...values);
      case 'max': return Math.max(...values);
      case 'sum': return total();
      case 'mean': return finite(total() / values.length);
      case 'median': {
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle]! : finite(sorted[middle - 1]! / 2 + sorted[middle]! / 2);
      }
      case 'mode': {
        const counts = new Map<number, number>();
        values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
        const frequency = Math.max(...counts.values());
        return [...counts].filter(([, count]) => count === frequency).map(([value]) => value).sort((a, b) => a - b);
      }
      default: return fail('function', `Неизвестная функция «${node.name}». Используйте справку блока.`);
    }
  }
  return evaluate(root);
}
