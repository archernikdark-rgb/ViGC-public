import { useEffect, useState } from 'react';

export function NumericField({ label, value, minimum, maximum, positive, integer, onChange }: {
  label: string; value: number; minimum?: number; maximum?: number; positive?: boolean; integer?:boolean; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const number = Number(draft.replace(',', '.'));
    if (!draft.trim() || !Number.isFinite(number) || (integer&&!Number.isInteger(number)) || (positive && number <= 0) || (minimum !== undefined && number < minimum) || (maximum !== undefined && number > maximum)) {
      setDraft(String(value)); setError(`Введите ${integer?'целое число':'число'}${positive ? ' больше 0' : ''}${minimum !== undefined ? ` от ${minimum}` : ''}${maximum !== undefined ? ` до ${maximum}` : ''}. Возвращено последнее корректное значение.`); return;
    }
    setError(''); onChange(number);
  }
  return <label className="field">{label}<input inputMode={integer?'numeric':'decimal'} value={draft} aria-invalid={Boolean(error)} onChange={event => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />{error && <small role="alert">{error}</small>}</label>;
}
