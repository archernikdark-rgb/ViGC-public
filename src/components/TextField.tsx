import { useEffect, useState } from 'react';

// Keep typing local until commit; Worker replies must not overwrite later keystrokes.
export function TextField({label,value,onChange,multiline=false,allowEmpty=false}:{label:string;value:string;onChange:(value:string)=>void;multiline?:boolean;allowEmpty?:boolean}) {
 const [draft,setDraft]=useState(value);
 useEffect(()=>setDraft(value),[value]);
 function commit(){const next=multiline?draft:draft.trim();if(!next&&!allowEmpty){setDraft(value);return;}if(next!==value)onChange(next);}
 return <label className="field">{label}{multiline?<textarea aria-label={label} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit}/>:<input aria-label={label} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>}</label>;
}
