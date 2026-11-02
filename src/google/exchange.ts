export type Direction='in'|'out'|'both';
export type SheetSource={kind:'parameter'|'node';id:string}|{kind:'snapshot';id:string;entryId:string;axis:'value'|'x'|'y'}|{kind:'snapshot-all';id:string};
export interface CellBinding {id:string;spreadsheetId:string;sheet:string;address:string;source:SheetSource;direction:Direction;mode:'number'|'formula'}
export interface CellData {values:(number|string|boolean|null)[];formulas:(string|null)[]}
export interface LocalData {values:number[];formula?:string}
export interface Baseline {local:string;remote:string}
export function cellRange(sheet:string,address:string,count?:number):string {
 const match=/^([A-Z]{1,3})([1-9]\d{0,6})(?::([A-Z]{1,3})([1-9]\d{0,6}))?$/.exec(address.trim().toUpperCase());
 if(!sheet.trim()||!match)throw Error('Укажите лист и ячейку либо точную строку/столбец, например B2 или B2:D2.');
 const column=(s:string)=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
 const x=column(match[1]),y=Number(match[2]),endX=column(match[3]??match[1]),endY=Number(match[4]??match[2]);
 const size=(endX-x+1)*(endY-y+1);
 if(endX<x||endY<y||(x!==endX&&y!==endY)||endX>18278||endY>1000000||size>1000||(count!==undefined&&count!==size))throw Error('Нужна строка или столбец до1000 ячеек, точно по числу значений источника.');
 return `'${sheet.replaceAll("'","''")}'!${address.trim().toUpperCase()}`;
}
export function rangeSize(address:string):number {const m=address.toUpperCase().match(/([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?/)!;const col=(s:string)=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0);return (col(m[3]??m[1])-col(m[1])+1)*(Number(m[4]??m[2])-Number(m[2])+1);}
export function validateBindings(value:unknown):asserts value is CellBinding[] {
 if(!Array.isArray(value)||value.length>100)throw Error('Некорректный список привязок (максимум100).');
 const ids=new Set<string>(),cells=new Set<string>();
 const incoming:SheetSource[]=[];
 for(const b of value){
  if(!b||typeof b!=='object'||typeof b.id!=='string'||!b.id||ids.has(b.id)||typeof b.spreadsheetId!=='string'||! /^[\w-]+$/.test(b.spreadsheetId)||typeof b.sheet!=='string'||typeof b.address!=='string'||!['in','out','both'].includes(b.direction)||!['number','formula'].includes(b.mode))throw Error('Некорректная привязка.');
  ids.add(b.id);cellRange(b.sheet,b.address);
  const s=b.source;
  if(!s||typeof s.id!=='string'||!s.id||!['parameter','node','snapshot','snapshot-all'].includes(s.kind)||(s.kind==='snapshot'&&(typeof s.entryId!=='string'||!['value','x','y'].includes(s.axis)))||(b.mode==='formula'&&(s.kind!=='node'||b.direction!=='out')))throw Error('Некорректный источник/направление привязки.');
  if(b.direction!=='out'){if(incoming.some(v=>v.kind===s.kind&&v.id===s.id&&(s.kind!=='snapshot'||(v.kind==='snapshot'&&v.entryId===s.entryId&&v.axis===s.axis))||v.id===s.id&&((v.kind==='snapshot-all'&&s.kind==='snapshot')||(s.kind==='snapshot-all'&&v.kind==='snapshot'))))throw Error('Одно локальное значение не может получать данные из нескольких привязок.');incoming.push(s);}
  const m=b.address.toUpperCase().match(/([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?/)!;
  const col=(a:string)=>[...a].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0);
  for(let x=col(m[1]);x<=col(m[3]??m[1]);x++)for(let y=+m[2];y<=+(m[4]??m[2]);y++){const key=JSON.stringify([b.spreadsheetId,b.sheet,x,y]);if(cells.has(key))throw Error('Адрес пересекается с другой привязкой.');cells.add(key);}
 }
}
export function decideExchange(direction:Direction,local:string,remote:string,base:Baseline|null,reconnect:boolean):'equal'|'idle'|'conflict'|'push'|'pull' {
 if(local===remote)return 'equal';
 if(reconnect||!base)return 'conflict';
 const l=local!==base.local,r=remote!==base.remote;
 if(!l&&!r)return 'idle';
 if(l&&r)return 'conflict';
 if(l)return direction==='in'?'conflict':'push';
 return direction==='out'?'conflict':'pull';
}
export const localKey=(v:LocalData)=>v.formula?JSON.stringify({formula:v.formula}):JSON.stringify(v.values);
export const remoteKey=(v:CellData,formula:boolean)=>formula&&v.formulas[0]?JSON.stringify({formula:v.formulas[0]}):v.formulas.some(Boolean)?JSON.stringify(v):JSON.stringify(v.values);
export interface ExchangeStatus {status:'off'|'busy'|'active'|'conflict'|'error';message:string;local?:LocalData;remote?:CellData}
export interface ExchangePort {
 local(binding:CellBinding):LocalData;
 read(binding:CellBinding):Promise<CellData>;
 write(binding:CellBinding,value:LocalData):Promise<void>;
 apply(binding:CellBinding,value:number[],expected:LocalData):Promise<void>;
 valid(binding:CellBinding):boolean;
}
export class SheetExchange {
 states=new Map<string,ExchangeStatus>();
 private baselines=new Map<string,Baseline>();
 private running=new Map<string,symbol>();
 private versions=new Map<string,number>();
 private epoch=0;
 private port:ExchangePort;
 private notify:()=>void;
 constructor(port:ExchangePort,notify:()=>void=()=>{}){this.port=port;this.notify=notify;}
 forget(id:string){this.pause(id);this.states.delete(id);this.notify();}
 private set(id:string,state:ExchangeStatus){this.states.set(id,state);this.notify();}
 reset(){this.epoch++;this.states.clear();this.baselines.clear();this.running.clear();this.versions.clear();this.notify();}
 pause(id:string){this.versions.set(id,(this.versions.get(id)??0)+1);this.running.delete(id);this.baselines.delete(id);this.set(id,{status:'off',message:'Обмен приостановлен.'});}
 async sync(b:CellBinding,action:'auto'|'start'|'local'|'remote'='auto'){
  if(this.running.has(b.id)||!this.port.valid(b))return;
  const state=this.states.get(b.id);
  if(action==='auto'&&(!state||state.status==='off'||state.status==='conflict'||state.status==='error'))return;
  const epoch=this.epoch,version=this.versions.get(b.id)??0,run=Symbol();this.running.set(b.id,run);
  const valid=()=>epoch===this.epoch&&version===(this.versions.get(b.id)??0)&&this.port.valid(b);
  const previous=state;this.set(b.id,{status:'busy',message:'Сверка…'});
  try{
   const local=this.port.local(b),remote=await this.port.read(b);if(!valid())return;
   const lk=localKey(local),rk=remoteKey(remote,b.mode==='formula');
   if(b.mode==='formula'&&lk===rk&&remote.values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Формула в Google не вычисляется. Проверьте её входы и адреса.');
   if(localKey(this.port.local(b))!==lk)throw Error('Значение изменилось во время сверки. Повторите обмен.');
   let decision=decideExchange(b.direction,lk,rk,this.baselines.get(b.id)??null,action==='start');
   if(action==='local'||action==='remote'){
    if(!previous?.local||!previous.remote||localKey(previous.local)!==lk||remoteKey(previous.remote,b.mode==='formula')!==rk){this.set(b.id,{status:'conflict',message:'Значения изменились. Выберите актуальное повторно.',local,remote});return;}
    if((action==='local'&&b.direction==='in')||(action==='remote'&&b.direction==='out'))throw Error('Это направление запрещено привязкой.');
    decision=action==='local'?'push':'pull';
   }
   if(decision==='conflict'){this.set(b.id,{status:'conflict',message:'Выберите актуальное значение.',local,remote});return;}
   if(decision==='push'){
    // Re-read immediately before writing: Sheets has no conditional values update.
    const check=await this.port.read(b);if(!valid())return;
    if(remoteKey(check,b.mode==='formula')!==rk||localKey(this.port.local(b))!==lk){this.set(b.id,{status:'conflict',message:'Данные изменились перед записью.',local:this.port.local(b),remote:check});return;}
    await this.port.write(b,local);if(!valid())return;
    const confirmed=await this.port.read(b);if(!valid())return;
    if(remoteKey(confirmed,b.mode==='formula')!==lk||(b.mode==='formula'&&confirmed.values.some(v=>typeof v!=='number'||!Number.isFinite(v)))){this.set(b.id,{status:'conflict',message:'Google вернул другое значение после записи.',local:this.port.local(b),remote:confirmed});return;}
    this.baselines.set(b.id,{local:lk,remote:remoteKey(confirmed,b.mode==='formula')});
   }else if(decision==='pull'){
    if(remote.values.length!==local.values.length||remote.values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('В таблице нужны конечные числа. Пустые ячейки, текст и ошибки не импортируются.');
    await this.port.apply(b,remote.values as number[],local);if(!valid())return;
    this.baselines.set(b.id,{local:JSON.stringify(remote.values),remote:rk});
   }else this.baselines.set(b.id,{local:lk,remote:rk});
   this.set(b.id,{status:'active',message:'Согласовано'});
  }catch(error){if(valid()){this.baselines.delete(b.id);this.set(b.id,{status:'error',message:error instanceof Error?error.message:'Обмен недоступен. Повторите сверку.'});}}
  finally{if(this.running.get(b.id)===run){this.running.delete(b.id);if(epoch===this.epoch&&this.states.get(b.id)?.status==='busy')this.set(b.id,{status:'off',message:'Обмен прерван. Повторите сверку.'});}}
 }
}
