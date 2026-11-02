import type { WorkspaceCommand, WorkspaceDocument } from '../workspace/document.ts';
import { readTargetParameter } from '../workspace/bindings.ts';
import type { ParameterTarget } from '../workspace/bindings.ts';

export function ParameterPicker({ document, target, label, onCommand }: {
  document: WorkspaceDocument; target: ParameterTarget; label: string;
  onCommand: (command: WorkspaceCommand) => void;
}) {
  const reading = readTargetParameter(document, target);
  return <label className="field parameter-picker nodrag nopan">{label}
    <select className={reading.status === 'unbound' || reading.status === 'missing' ? 'missing-input' : undefined} value={reading.status === 'unbound' ? '' : reading.reference.parameterId}
      onChange={event => {
        if (!event.target.value) {
          if (reading.status !== 'unbound') onCommand({ type: 'reference.remove', id: reading.reference.id });
          return;
        }
        onCommand({ type: 'reference.bind', referenceId: crypto.randomUUID(), target, parameterId: event.target.value });
      }}>
      <option value="">Без привязки</option>
      {reading.status === 'error' && <small role="alert">{reading.message}</small>}
    {reading.status === 'missing' && <option value={reading.reference.parameterId} disabled>Источник удалён — выберите замену</option>}
      {document.parameters.map(parameter => <option key={parameter.id} value={parameter.id}>
        {document.entities.find(entity => entity.id === parameter.ownerId)?.name} / {parameter.name}
      </option>)}
    </select>
    {reading.status === 'error' && <small role="alert">{reading.message}</small>}
    {reading.status === 'missing' && <small role="alert">Потерянная ссылка. Выберите другой параметр или снимите привязку.</small>}
    {!document.parameters.length && <small>Добавьте параметр участника.</small>}
  </label>;
}
