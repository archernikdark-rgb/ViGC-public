import { readCells, writeCells } from './cells.ts';
import type { GoogleConfig, GoogleGateway, SheetDetails, TrainingSheet } from './connection.ts';
import type { GoogleSelection } from '../persistence/project.ts';
const scope='https://www.googleapis.com/auth/drive.file';
interface TokenResponse { access_token?:string;expires_in?:number;scope?:string;error?:string }
interface TokenClient {requestAccessToken(options:{prompt:string}):void}
interface Picker {setVisible(visible:boolean):void;dispose():void}
interface PickerBuilder {
 addView(view:unknown):PickerBuilder;setOAuthToken(token:string):PickerBuilder;
 setDeveloperKey(key:string):PickerBuilder;setAppId(id:string):PickerBuilder;
 setOrigin(origin:string):PickerBuilder;setTitle(title:string):PickerBuilder;
 setCallback(callback:(data:{action:string;docs?:{id:string;name:string}[]})=>void):PickerBuilder;build():Picker;
}
interface GoogleSDK {
 accounts:{oauth2:{initTokenClient(config:{client_id:string;scope:string;include_granted_scopes:boolean;callback:(response:TokenResponse)=>void;error_callback:(error:{type:string})=>void}):TokenClient;revoke(token:string,callback:(response:{successful?:boolean})=>void):void}};
 picker:{PickerBuilder:new()=>PickerBuilder;DocsView:new()=>{setMimeTypes(type:string):unknown}};
}
const sdk=()=> (window as unknown as {google:GoogleSDK}).google;
let preparation:Promise<void>|null=null;
function loadScript(src:string){return new Promise<void>((resolve,reject)=>{
 const script=document.createElement('script');script.src=src;script.async=true;
 const timeout=window.setTimeout(()=>{script.remove();reject(Error('Google не ответил. Повторите загрузку.'));},15000);
 script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);script.remove();reject(Error('Google недоступен. Проверьте соединение.'));};document.head.append(script);
});}
export function browserGoogleGateway(config:GoogleConfig):GoogleGateway {
 return {
  prepare(){
   if(!preparation)preparation=Promise.all([loadScript('https://accounts.google.com/gsi/client'),loadScript('https://apis.google.com/js/api.js').then(()=>new Promise<void>((resolve,reject)=>{
    const gapi=(window as unknown as {gapi:{load(name:string,options:{callback:()=>void;onerror:()=>void;timeout:number;ontimeout:()=>void}):void}}).gapi;
    gapi.load('picker',{callback:resolve,onerror:()=>reject(Error('Picker недоступен.')),timeout:15000,ontimeout:()=>reject(Error('Picker не ответил.'))});
   }))]).then(()=>{}).catch(error=>{preparation=null;throw error;});
   return preparation;
  },
  authorize(){return new Promise((resolve,reject)=>{
   const client=sdk().accounts.oauth2.initTokenClient({client_id:config.clientId,scope,include_granted_scopes:false,
    callback:response=>{if(response.error||!response.access_token||!response.scope?.split(' ').includes(scope))reject(Error('Доступ к выбранным файлам не предоставлен. Повторите подключение.'));else resolve({token:response.access_token,expiresIn:Number(response.expires_in)});},
    error_callback:error=>reject(Error(error.type==='popup_closed'?'Вход Google отменён.':error.type==='popup_failed_to_open'?'Разрешите всплывающее окно Google и повторите.':'Не удалось войти в Google. Повторите.'))});
   client.requestAccessToken({prompt:'select_account'});
  });},
  pick(token){return new Promise<GoogleSelection|null>((resolve,reject)=>{
   let picker:Picker;try{const api=sdk().picker;picker=new api.PickerBuilder().addView(new api.DocsView().setMimeTypes('application/vnd.google-apps.spreadsheet')).setOAuthToken(token).setDeveloperKey(config.apiKey).setAppId(config.appId).setOrigin(window.location.origin).setTitle('Выберите таблицу для ViGC').setCallback(data=>{
    if(data.action==='picked'){const doc=data.docs?.[0];picker.dispose();if(doc&&/^[\w-]+$/.test(doc.id))resolve({id:doc.id,name:doc.name});else reject(Error('Google не вернул выбранную таблицу.'));}
    else if(data.action==='cancel'){picker.dispose();resolve(null);}
   }).build();picker.setVisible(true);}catch{reject(Error('Не удалось открыть выбор таблицы. Повторите подключение.'));}
  });},
  async inspect(token,id):Promise<SheetDetails>{
   const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=spreadsheetId,properties(title),sheets(properties(title))`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error(response.status===401?'Доступ Google истёк. Подключите таблицу повторно.':response.status===403?'Нет доступа к этой таблице. Проверьте разрешение и выберите её повторно.':response.status===404?'Таблица удалена или недоступна. Выберите другую.':'Google не ответил. Повторите подключение.');
   const body=await response.json() as {spreadsheetId?:string;properties?:{title?:string};sheets?:{properties?:{title?:string}}[]};
   if(body.spreadsheetId!==id||typeof body.properties?.title!=='string'||!Array.isArray(body.sheets))throw Error('Google вернул неполные данные таблицы. Повторите подключение.');
   return {id,name:body.properties.title,sheets:body.sheets.map(sheet=>sheet.properties?.title??'')};
  },
  async createTrainingWorkbook(token,title,names):Promise<SheetDetails>{
   const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({properties:{title},sheets:names.map((name,index)=>({properties:{sheetId:100+index,title:name}}))}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(response.status===401?'Доступ Google истёк. Подключите аккаунт повторно.':response.status===403?'Google не разрешил создать таблицу. Проверьте доступ аккаунта и повторите.':response.status===429?'Google ограничил создание файлов. Подождите и повторите.':'Не удалось создать учебную таблицу. Проверьте доступ Google и повторите.');
   const body=await response.json() as {spreadsheetId?:string;properties?:{title?:string}};
   if(!body.spreadsheetId||!/^[\w-]+$/.test(body.spreadsheetId)||body.properties?.title!==title)throw Error('Google не подтвердил создание учебной таблицы. Проверьте список файлов, прежде чем повторять.');
   return this.inspect(token,body.spreadsheetId);
  },
  async writeTrainingSheets(token,id,sheets:TrainingSheet[]){
   const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',includeValuesInResponse:false,data:sheets.map(sheet=>({range:`'${sheet.name.replaceAll("'","''")}'!A1`,majorDimension:'ROWS',values:sheet.values}))}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(response.status===401?'Доступ Google истёк. Подключите аккаунт повторно.':response.status===403?'Нет доступа к учебной таблице или её листам. Подключите аккаунт, с которым вы её создали.':response.status===404?'Учебная таблица или лист удалены. Проверьте ссылку либо создайте новую таблицу.':response.status===429?'Google ограничил запись. Подождите и повторите.':'Google не принял данные учебной таблицы. Проверьте листы и повторите.');
   const body=await response.json() as {totalUpdatedCells?:number};
   const expected=sheets.reduce((total,sheet)=>total+sheet.values.reduce((rows,row)=>rows+row.length,0),0);
   if(typeof body.totalUpdatedCells!=='number'||body.totalUpdatedCells<expected)throw Error('Google не подтвердил запись всех ячеек. Откройте учебную таблицу и проверьте результат.');
  },
  async readTrainingSheets(token,id,names){
   const query=new URLSearchParams({valueRenderOption:'FORMULA'});for(const name of names)query.append('ranges',`'${name.replaceAll("'","''")}'!A1:Z200`);
   const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchGet?${query}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(response.status===401?'Доступ Google истёк. Подключите аккаунт повторно.':response.status===403?'Нет доступа для проверки учебной таблицы. Выберите аккаунт, которому принадлежит файл.':response.status===404?'Учебная таблица или лист удалены. Проверьте ссылку либо создайте новую таблицу.':'Google не подтвердил чтение учебной таблицы. Повторите проверку.');
   const body=await response.json() as {valueRanges?:{range?:string;values?:unknown[][]}[]};if(!Array.isArray(body.valueRanges)||body.valueRanges.length!==names.length)throw Error('Google вернул неполный список учебных листов.');
   return body.valueRanges.map((range,index)=>({name:names[index]!,values:(range.values??[]).map(row=>row.map(value=>typeof value==='string'||typeof value==='number'||typeof value==='boolean'?value:null))}));
  },
  read:readCells,
  write:writeCells,
  revoke(token){return new Promise<void>((resolve,reject)=>{const timer=window.setTimeout(()=>reject(Error('Google не подтвердил отзыв доступа.')),10000);sdk().accounts.oauth2.revoke(token,response=>{clearTimeout(timer);response.successful?resolve():reject(Error('Не удалось отозвать доступ.'));});});},
 };
}
