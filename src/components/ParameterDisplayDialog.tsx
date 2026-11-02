import { useEffect, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../workspace/document.ts';

export function ParameterDisplayDialog({document,onCreate,onClose}:{document:WorkspaceDocument;onCreate:(id:string)=>void;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),[parameter,setParameter]=useState('');
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 return <dialog ref={dialog} className="link-dialog" onCancel={onClose}><form onSubmit={event=>{event.preventDefault();if(parameter)onCreate(parameter);}}><div className="section-heading"><h2>Отображение параметра</h2><span className="header-spacer"/><button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}>×</button></div>
 <label className="field">Параметр<select autoFocus value={parameter} onChange={event=>setParameter(event.target.value)}><option value="">Выберите параметр</option>{document.entities.map(entity=>{const parameters=document.parameters.filter(p=>p.ownerId===entity.id);return parameters.length?<optgroup key={entity.id} label={entity.name}>{parameters.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</optgroup>:null;})}</select></label>
 {!document.parameters.length&&<p>Сначала добавьте параметр сущности.</p>}<div className="dialog-actions"><button type="button" onClick={onClose}>Отмена</button><button className="primary" disabled={!parameter}>Добавить</button></div></form></dialog>;
}
