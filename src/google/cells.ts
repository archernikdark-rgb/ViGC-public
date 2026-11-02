import type { CellBinding, CellData, LocalData } from './exchange.ts';
import { cellRange, rangeSize } from './exchange.ts';
async function request(token:string,b:CellBinding,query:string,options:RequestInit={}){
 const range=cellRange(b.sheet,b.address);
 let response:Response;
 try{response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(b.spreadsheetId)}/values/${encodeURIComponent(range)}?${query}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});}
 catch{throw Error('Нет ответа Google. Локальные данные сохранены; после восстановления повторите сверку.');}
 if(!response.ok)throw Error(response.status===401?'Доступ истёк. Подключите таблицу снова.':response.status===403?'Нет разрешения на обмен с этим диапазоном. Проверьте доступ.':response.status===404?'Таблица или лист недоступны. Проверьте привязку.':response.status===429?'Лимит Google. Подождите и повторите сверку.':'Google отклонил диапазон или запрос. Проверьте лист и адрес.');
 return response.json();
}
function flatten(body:unknown,b:CellBinding):(number|string|boolean|null)[]{
 const values=(body as {values?:unknown}).values;
 if(values!==undefined&&(!Array.isArray(values)||values.some(row=>!Array.isArray(row))))throw Error('Google вернул некорректные значения.');
 const rows=(values??[]) as (number|string|boolean|null)[][];
 const m=b.address.toUpperCase().match(/[A-Z]+(\d+)(?::[A-Z]+(\d+))?/)!;
 const vertical=m[2]!==undefined&&m[2]!==m[1],size=rangeSize(b.address);
 return Array.from({length:size},(_,i)=>vertical?rows[i]?.[0]??null:rows[0]?.[i]??null);
}
export async function readCells(token:string,b:CellBinding):Promise<CellData>{
 const range=cellRange(b.sheet,b.address);
 let response:Response;
 try{response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(b.spreadsheetId)}?ranges=${encodeURIComponent(range)}&includeGridData=true&fields=sheets(data(rowData(values(effectiveValue,userEnteredValue))))`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});}
 catch{throw Error('Нет ответа Google. Повторите сверку после восстановления связи.');}
 if(!response.ok)throw Error(response.status===401?'Доступ истёк. Подключите таблицу снова.':response.status===403?'Нет доступа к диапазону. Проверьте разрешения.':response.status===429?'Лимит Google. Подождите и повторите.':'Таблица, лист или диапазон недоступны. Проверьте привязку.');
 type Value={numberValue?:number;stringValue?:string;boolValue?:boolean;formulaValue?:string;errorValue?:{message?:string}};
 const body=await response.json() as {sheets?:{data?:{rowData?:{values?:{effectiveValue?:Value;userEnteredValue?:Value}[]}[]}[]}[]};
 if(!Array.isArray(body.sheets)||!body.sheets.length)throw Error('Google не вернул запрошенный диапазон.');
 const rows=body.sheets[0].data?.[0].rowData??[];
 const numeric=rows.map(row=>(row.values??[]).map(c=>{const v=c.effectiveValue;return v?.errorValue?`Ошибка: ${v.errorValue.message??'формула'}`:v?.numberValue??v?.stringValue??v?.boolValue??null;}));
 const formulas=rows.map(row=>(row.values??[]).map(c=>c.userEnteredValue?.formulaValue??null));
 return {values:flatten({values:numeric},b),formulas:flatten({values:formulas},b).map(v=>typeof v==='string'?v:null)};
}
export async function writeCells(token:string,b:CellBinding,value:LocalData):Promise<void>{
 cellRange(b.sheet,b.address,value.values.length);
 if(value.formula&&value.values.length!==1)throw Error('Формула записывается в одну ячейку.');
 const list=value.formula?[value.formula]:value.values;
 const m=b.address.toUpperCase().match(/[A-Z]+(\d+)(?::[A-Z]+(\d+))?/)!;
 const vertical=m[2]!==undefined&&m[2]!==m[1];
 const result=await request(token,b,`valueInputOption=${value.formula?'USER_ENTERED':'RAW'}`,{method:'PUT',body:JSON.stringify({range:cellRange(b.sheet,b.address),majorDimension:'ROWS',values:vertical?list.map(v=>[v]):[list]})});
 if(result.updatedCells!==list.length)throw Error('Google не подтвердил запись всех ячеек. Повторите сверку.');
}
