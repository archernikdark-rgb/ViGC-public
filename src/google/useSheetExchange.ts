import { useEffect, useRef, useState } from 'react';
import { SheetExchange } from './exchange.ts';
import { bindingData } from './sources.ts';
import type { WorkspaceDocument } from '../workspace/document.ts';
import type { Playback } from '../engine/playback.ts';
import type { EngineCommand, EngineResponse } from '../engine/protocol.ts';
import type { GoogleConnection, GoogleState } from './connection.ts';
export function useSheetExchange(options:{document:WorkspaceDocument;playback:Playback;connection:GoogleConnection;state:GoogleState;blocked:()=>boolean;request:(command:EngineCommand|'capture')=>Promise<EngineResponse>}){
 const latest=useRef(options);latest.current=options;
 const [,render]=useState(0),ref=useRef<SheetExchange|null>(null);
 if(!ref.current)ref.current=new SheetExchange({
  local:b=>bindingData(latest.current.document,latest.current.playback,b),
  valid:b=>!latest.current.blocked()&&latest.current.connection.state.status==='connected'&&latest.current.connection.state.selection?.id===b.spreadsheetId&&latest.current.document.sheets.some(v=>JSON.stringify(v)===JSON.stringify(b)),
  read:b=>latest.current.connection.read(b),write:(b,v)=>latest.current.connection.write(b,v),
  async apply(b,values,expected){await latest.current.request({type:'sheets.apply',bindingId:b.id,values,expected,binding:b,projectId:latest.current.document.id});}
 },()=>render(n=>n+1));
 const exchange=ref.current;
 const debounceUntil=useRef(0);
 const signature=JSON.stringify([options.document.id,options.state.status,options.state.selection?.id]);
 useEffect(()=>{exchange.reset();},[signature]);
 const previousBindings=useRef(options.document.sheets);
 useEffect(()=>{for(const old of previousBindings.current){const current=options.document.sheets.find(b=>b.id===old.id);if(!current||JSON.stringify(old)!==JSON.stringify(current))exchange.forget(old.id);}previousBindings.current=options.document.sheets;},[JSON.stringify(options.document.sheets)]);
 const authored=JSON.stringify([options.document.parameters,options.document.logic,options.document.shapes,options.document.evaluations,options.playback.snapshots]);
 useEffect(()=>{debounceUntil.current=Date.now()+500;const timer=window.setTimeout(()=>{for(const b of latest.current.document.sheets)void exchange.sync(b);},500);return()=>clearTimeout(timer);},[authored]);
 useEffect(()=>{const timer=window.setInterval(()=>{if(!window.document.hidden&&Date.now()>=debounceUntil.current)for(const b of latest.current.document.sheets)void exchange.sync(b);},5000);return()=>clearInterval(timer);},[]);
 return exchange;
}
