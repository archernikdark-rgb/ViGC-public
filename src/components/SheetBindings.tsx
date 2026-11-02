import { useEffect, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../workspace/document.ts';
import type { Playback } from '../engine/playback.ts';
import type { CellBinding, CellData, SheetExchange } from '../google/exchange.ts';
import { validateBindings } from '../google/exchange.ts';
import { bindingData, sourceOptions, writable } from '../google/sources.ts';
import type { GoogleConnection, GoogleState } from '../google/connection.ts';
const directions={in:'Таблица → приложение',out:'Приложение → таблица',both:'Таблица ↔ приложение'};
const show=(values:unknown[]|undefined)=>values?.map(v=>v===null?'пусто':String(v)).join(' · ')??'—';
export function SheetBindings({document:doc,playback,state,connection,exchange,onSave,onClose}:{document:WorkspaceDocument;playback:Playback;state:GoogleState;connection:GoogleConnection;exchange:SheetExchange;onSave:(bindings:CellBinding[])=>Promise<void>;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [selected,setSelected]=useState<string|null>(null),[draft,setDraft]=useState<CellBinding|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState<CellData|null>(null);
 const [conflict,setConflict]=useState<string|null>(null);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 const options=sourceOptions(doc,playback);
 const binding=doc.sheets.find(b=>b.id===selected),conflicted=doc.sheets.find(b=>b.id===conflict);
 const status=conflicted&&exchange.states.get(conflicted.id);
 useEffect(()=>{if(conflict&&status&&status.status!=='conflict'&&status.status!=='busy')setConflict(null);},[conflict,status?.status]);
 useEffect(()=>{if(!draft){setPreview(null);return;}let active=true;setPreview(null);
  const timer=window.setTimeout(()=>{try{bindingData(doc,playback,draft);if(state.status==='connected'&&draft.spreadsheetId===state.selection?.id)void connection.read(draft).then(v=>{if(active)setPreview(v);}).catch(e=>{if(active)setError(e.message);});}catch{}},500);
  return()=>{active=false;clearTimeout(timer);};
 },[draft?.sheet,draft?.address,JSON.stringify(draft?.source),draft?.mode,state.status]);
 function local(b:CellBinding){try{return bindingData(doc,playback,b);}catch{return null;}}
 function change(update:Partial<CellBinding>){setError('');setDraft(current=>current?{...current,...update}:null);}
 async function save(){if(!draft)return;setBusy(true);setError('');try{
  const b={...draft,address:draft.address.trim().toUpperCase()};bindingData(doc,playback,b);const bindings=[...doc.sheets.filter(v=>v.id!==b.id),b];validateBindings(bindings);await onSave(bindings);setSelected(b.id);setDraft(null);
 }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить привязку.');}finally{setBusy(false);}}
 async function remove(b:CellBinding){setBusy(true);try{await onSave(doc.sheets.filter(v=>v.id!==b.id));setSelected(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function add(){const source=options[0]?.source;if(!source){setError('Сначала создайте параметр, вычисление или снимок.');return;}if(!state.selection){setError('Сначала подключите таблицу Google.');return;}
  setError('');setDraft({id:crypto.randomUUID(),spreadsheetId:state.selection.id,sheet:state.sheets[0]??'',address:'A1',source,direction:writable(doc,source)?'both':'out',mode:'number'});
 }
 const active=state.status==='connected';
 return <dialog className="sheet-dialog" ref={dialog} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
 <div className="sheet-heading"><h2>{draft?'Настройка привязки':conflicted?'Выберите актуальное значение':'Привязки Google Sheets'}</h2><button aria-label="Закрыть привязки" disabled={busy} onClick={onClose}>×</button></div>
 <p className="quiet">{state.selection?.name??'Таблица не выбрана'} · {active?'Подключено':'Доступ не подтверждён. Подключите нужную таблицу в меню проекта.'}</p>
 {error&&<p role="alert" className="binding-error">{error}</p>}
 {draft?<>
  <div className="sheet-fields">
   <label className="field">Источник<select value={JSON.stringify(draft.source)} onChange={e=>{const source=JSON.parse(e.target.value);change({source,direction:writable(doc,source)?draft.direction:'out',mode:'number'});}}>
    {!options.some(v=>JSON.stringify(v.source)===JSON.stringify(draft.source))&&<option value={JSON.stringify(draft.source)}>Источник удалён — выберите замену</option>}
    {options.map(v=><option key={JSON.stringify(v.source)} value={JSON.stringify(v.source)}>{v.label}</option>)}
   </select></label>
   <label className="field">Направление<select value={draft.direction} onChange={e=>change({direction:e.target.value as CellBinding['direction']})}>{Object.entries(directions).map(([v,label])=><option key={v} value={v} disabled={v!=='out'&&(!writable(doc,draft.source)||draft.mode==='formula')}>{label}</option>)}</select></label>
   <label className="field">Лист<input list="sheet-names" value={draft.sheet} onChange={e=>change({sheet:e.target.value})}/><datalist id="sheet-names">{state.sheets.map(name=><option key={name} value={name}/>)}</datalist></label>
   <label className="field">Ячейка или точный диапазон<input placeholder="B2 или B2:D2" value={draft.address} onChange={e=>change({address:e.target.value})}/></label>
   {draft.source.kind==='node'&&<label className="field">Передавать<select value={draft.mode} onChange={e=>change({mode:e.target.value as CellBinding['mode'],direction:'out'})}><option value="number">Числовой результат</option><option value="formula">Формулу Sheets</option></select></label>}
  </div>
  <h3>Перед началом обмена</h3><div className="sheet-compare"><div><small>Приложение</small><strong>{show(local(draft)?.values)}</strong>{local(draft)?.formula&&<code>{local(draft)?.formula}</code>}</div><div><small>Таблица · {draft.sheet}!{draft.address}</small><strong>{preview?show(preview.values):'Ещё не прочитано'}</strong>{preview?.formulas.some(Boolean)&&<code>{preview.formulas.filter(Boolean).join(' · ')}</code>}</div></div>
  <p className="quiet">Сохранение привязки ничего не записывает. Первый обмен запускается отдельно; запись заменяет только выбранные ячейки, включая их формулы.</p>
  {draft.source.kind==='snapshot-all'&&<p className="quiet">Порядок: параметры снимка, затем x и y каждой точки. Число ячеек должно точно совпадать с числом значений.</p>}
  <div className="sheet-actions"><button className="primary" disabled={busy} onClick={()=>void save()}>Сохранить привязку</button><button disabled={busy} onClick={()=>{setDraft(null);setError('');}}>Отмена</button></div>
 </>:conflicted&&status?.status==='conflict'?<>
  <h3>{options.find(v=>JSON.stringify(v.source)===JSON.stringify(conflicted.source))?.label??'Источник удалён'}</h3><p className="quiet">{conflicted.sheet}!{conflicted.address} · {directions[conflicted.direction]}</p>
  <p role="status">{status.message} Обмен этой привязки приостановлен.</p>
  <div className="sheet-compare">
   <div><small>В приложении</small><strong>{show(status.local?.values)}</strong>{status.local?.formula&&<code>{status.local.formula}</code>}<p>Заменит содержимое выбранных ячеек.</p><button disabled={!active||conflicted.direction==='in'} onClick={()=>void exchange.sync(conflicted,'local')}>Оставить значение приложения</button></div>
   <div><small>В Google Sheets</small><strong>{show(status.remote?.values)}</strong>{status.remote?.formulas.some(Boolean)&&<code>{status.remote.formulas.filter(Boolean).join(' · ')}</code>}<p>Заменит числовое значение в приложении.</p><button disabled={!active||conflicted.direction==='out'} onClick={()=>void exchange.sync(conflicted,'remote')}>Оставить значение таблицы</button></div>
  </div><p className="quiet">Другие исправные привязки продолжают работать. Можно вернуться к выбору позже.</p><button onClick={()=>setConflict(null)}>Решить позже</button>
 </>:<>
  <div className="sheet-actions"><button onClick={add} disabled={busy}>+ Добавить привязку</button></div>
  {doc.sheets.length?<div className="sheet-table-scroll"><table className="sheet-table"><thead><tr><th>Источник</th><th>Ячейка</th><th>Направление</th><th>Обмен</th></tr></thead><tbody>{doc.sheets.map(b=>{const s=exchange.states.get(b.id);return <tr key={b.id} className={selected===b.id?'selected':''}>
   <td><button onClick={()=>setSelected(b.id)}>{options.find(v=>JSON.stringify(v.source)===JSON.stringify(b.source))?.label??'Источник удалён'}</button></td><td>{b.sheet}!{b.address}{b.spreadsheetId!==state.selection?.id&&<small>Другая таблица</small>}</td><td>{directions[b.direction]}{b.mode==='formula'&&<small>Формула Sheets</small>}</td><td>{s?.message??'Ещё не запущен'}{s?.status==='conflict'&&<button onClick={()=>setConflict(b.id)}>Выбрать значение</button>}</td>
  </tr>;})}</tbody></table></div>:<p>Привязок пока нет. Добавьте источник и адрес для первого обмена.</p>}
  {binding&&<section className="sheet-selected"><h3>{options.find(v=>JSON.stringify(v.source)===JSON.stringify(binding.source))?.label??'Источник удалён'}</h3><p>Приложение: {show(local(binding)?.values)}</p>
   {exchange.states.get(binding.id)?.status==='active'?<button onClick={()=>exchange.pause(binding.id)}>Приостановить обмен</button>:<button className="primary" disabled={!active||binding.spreadsheetId!==state.selection?.id||exchange.states.get(binding.id)?.status==='busy'} onClick={()=>void exchange.sync(binding,'start')}>Начать обмен / сверить</button>}
   <button disabled={busy} onClick={()=>{setError('');setDraft(structuredClone(binding));}}>Изменить</button><button disabled={busy} onClick={()=>void remove(binding)}>Удалить привязку</button>
   {binding.direction==='out'&&<p className="quiet">Первый запуск сверяет оба значения. При расхождении запись требует вашего выбора; она заменит содержимое только выбранного диапазона.</p>}
  </section>}
  <p className="quiet">После запуска ручные правки передаются автоматически. Проигрывание ничего не записывает. Удаление привязки сохраняет значения в приложении и таблице.</p>
 </>}
 </dialog>;
}
