import { useEffect, useRef, useState } from 'react';
export function ProjectNameDialog({onDecision}:{onDecision:(name:string|null)=>void}) {
 const ref=useRef<HTMLDialogElement>(null),[name,setName]=useState('');
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 return <dialog ref={ref} className="link-dialog" onCancel={event=>{event.preventDefault();onDecision(null);}}><form onSubmit={event=>{event.preventDefault();if(name.trim())onDecision(name.trim());}}><h2>Сохранить проект</h2><label className="field">Название<input autoFocus value={name} onChange={event=>setName(event.target.value)} placeholder="Название проекта"/></label><div className="dialog-actions"><button type="button" onClick={()=>onDecision(null)}>Отмена</button><button className="primary" disabled={!name.trim()}>Сохранить</button></div></form></dialog>;
}
