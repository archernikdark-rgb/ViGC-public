import {useEffect,useRef,useState} from 'react';
import type {WorkspaceCommand} from '../workspace/document.ts';
type Row={id:string;name:string;value:string};
export function EntityCreateDialog({onCreate,onClose,defaultName}:{onCreate:(command:WorkspaceCommand,id:string)=>void;onClose:()=>void;defaultName:string}) {
 const ref=useRef<HTMLDialogElement>(null), [name,setName]=useState(''), [rows,setRows]=useState<Row[]>([]), [error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 function submit(){
  if(rows.some(row=>!row.name.trim() || !row.value.trim() || !Number.isFinite(Number(row.value.replace(',','.'))))){setError('Укажите название и конечное число для каждого параметра.');return;}
  const id=crypto.randomUUID();onCreate({type:'entity.create',entity:{id,name:name.trim()||defaultName},parameters:rows.map(row=>({id:row.id,ownerId:id,name:row.name.trim(),value:Number(row.value.replace(',','.'))}))},id);onClose();
 }
 return <dialog ref={ref} className="entity-create-dialog" onCancel={onClose}><form onSubmit={e=>{e.preventDefault();submit();}}><div className="section-heading"><h2>Новая сущность</h2><button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}>×</button></div><label className="field">Имя<input autoFocus value={name} placeholder={defaultName} onChange={e=>setName(e.target.value)}/></label><h3>Параметры</h3>{rows.map((row,index)=><div className="entity-create-row" key={row.id}><label className="field">Название<input aria-label={`Название параметра ${index+1}`} value={row.name} onChange={e=>setRows(rows.map(r=>r.id===row.id?{...r,name:e.target.value}:r))}/></label><label className="field">Значение<input aria-label={`Значение параметра ${index+1}`} inputMode="decimal" value={row.value} onChange={e=>setRows(rows.map(r=>r.id===row.id?{...r,value:e.target.value}:r))}/></label><button type="button" aria-label={`Удалить параметр ${index+1}`} onClick={()=>setRows(rows.filter(r=>r.id!==row.id))}>×</button></div>)}<button type="button" onClick={()=>setRows([...rows,{id:crypto.randomUUID(),name:'',value:'0'}])}>＋ Добавить параметр</button>{error&&<p role="alert" className="binding-error">{error}</p>}<div className="dialog-actions"><button type="button" onClick={onClose}>Отмена</button><button className="primary">Создать</button></div></form></dialog>;
}
