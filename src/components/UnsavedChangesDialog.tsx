import { useEffect, useRef } from 'react';
export type SwitchDecision='save'|'discard'|'cancel';
export function UnsavedChangesDialog({onDecision}:{onDecision:(decision:SwitchDecision)=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();return ()=>dialog.current?.close();},[]);
 return <dialog ref={dialog} className="link-dialog" onCancel={event=>{event.preventDefault();onDecision('cancel');}} aria-labelledby="unsaved-title"><h2 id="unsaved-title">Сохранить изменения?</h2><p>В проекте есть несохранённые изменения.</p><div className="dialog-actions"><button onClick={()=>onDecision('cancel')}>Остаться</button><button onClick={()=>onDecision('discard')}>Не сохранять</button><button className="primary" autoFocus onClick={()=>onDecision('save')}>Сохранить</button></div></dialog>;
}
