import type { CellBinding, CellData, LocalData } from './exchange.ts';
import type { GoogleSelection } from '../persistence/project.ts';
export interface GoogleConfig { clientId:string;apiKey:string;appId:string }
export interface SheetDetails extends GoogleSelection { sheets:string[] }
export interface TrainingSheet { name:string; values:(string|number|boolean|null)[][] }
export interface GoogleGateway {
 prepare():Promise<void>;
 authorize():Promise<{token:string;expiresIn:number}>;
 pick(token:string):Promise<GoogleSelection|null>;
 inspect(token:string,id:string):Promise<SheetDetails>;
 read?(token:string,binding:CellBinding):Promise<CellData>;
 write?(token:string,binding:CellBinding,value:LocalData):Promise<void>;
 createTrainingWorkbook?(token:string,title:string,sheets:string[]):Promise<SheetDetails>;
 writeTrainingSheets?(token:string,id:string,sheets:TrainingSheet[]):Promise<void>;
 readTrainingSheets?(token:string,id:string,names:string[]):Promise<TrainingSheet[]>;
 revoke(token:string):Promise<void>;
}
export interface GoogleState {
 status:'unconfigured'|'loading'|'ready'|'authorizing'|'choosing'|'checking'|'connected'|'expired'|'error';
 selection:GoogleSelection|null; sheets:string[]; message:string;
}
export class GoogleConnection {
 state:GoogleState={status:'loading',selection:null,sheets:[],message:''};
 private token:string|null=null;
 private expiresAt=0;
 private generation=0;
 private prepared=false;
 private config:GoogleConfig;
 private gateway:GoogleGateway;
 private now:()=>number;
 private notify:(state:GoogleState)=>void;
 constructor(config:GoogleConfig,gateway:GoogleGateway,now=Date.now,notify:(state:GoogleState)=>void=()=>{}){this.config=config;this.gateway=gateway;this.now=now;this.notify=notify;}
 private update(update:Partial<GoogleState>){this.state={...this.state,...update};this.notify(this.state);}
 async prepare(){
  if(!this.config.clientId||!this.config.apiKey||!this.config.appId){this.update({status:'unconfigured',message:'Подключение Google пока недоступно в этой сборке. Локальная работа доступна.'});return;}
  const generation=this.generation;this.update({status:'loading',message:''});
  try{await this.gateway.prepare();if(generation!==this.generation)return;this.prepared=true;this.update({status:'ready'});}catch{if(generation===this.generation)this.update({status:'error',message:'Не удалось загрузить подключение Google. Проверьте сеть и повторите.'});}
 }
 async connect(){
  if(!this.prepared){await this.prepare();return;}
  if(['authorizing','choosing','checking'].includes(this.state.status))return;
  const generation=++this.generation;this.update({status:'authorizing',message:''});
  try{
   const authorization=await this.gateway.authorize();
   if(generation!==this.generation){await this.gateway.revoke(authorization.token);return;}
   if(!authorization.token||!Number.isFinite(authorization.expiresIn)||authorization.expiresIn<=0)throw Error('Google не предоставил действующий доступ.');
   this.token=authorization.token;this.expiresAt=this.now()+authorization.expiresIn*1000;
   this.update({status:'choosing'});const selection=await this.gateway.pick(this.token);
   if(generation!==this.generation)return;
   if(!selection){this.update({status:'ready',message:'Выбор таблицы отменён. Подключение не изменено.'});return;}
   if(!this.token||this.now()>=this.expiresAt)throw Error('Доступ Google истёк. Подключите таблицу повторно.');
   this.update({status:'checking'});const details=await this.gateway.inspect(this.token,selection.id);
   if(generation!==this.generation)return;
   this.update({status:'connected',selection:{id:details.id,name:details.name},sheets:details.sheets,message:''});this.checkExpiry();
  }catch(error){if(generation===this.generation){this.token=null;this.expiresAt=0;this.update({status:'error',message:error instanceof Error?error.message:'Не удалось подключить таблицу. Повторите доступ.'});}}
 }
 private access(binding:CellBinding){
  this.checkExpiry();if(this.state.status!=='connected'||!this.token||binding.spreadsheetId!==this.state.selection?.id)throw Error('Подключите нужную таблицу Google и повторите сверку.');
  return {token:this.token,generation:this.generation};
 }
 async read(binding:CellBinding){const access=this.access(binding);if(!this.gateway.read)throw Error('Чтение ячеек недоступно.');const data=await this.gateway.read(access.token,binding);if(access.generation!==this.generation)throw Error('Подключение изменилось.');this.access(binding);return data;}
 async write(binding:CellBinding,value:LocalData){const access=this.access(binding);if(!this.gateway.write)throw Error('Запись ячеек недоступна.');await this.gateway.write(access.token,binding,value);if(access.generation!==this.generation)throw Error('Подключение изменилось во время записи. Проверьте таблицу.');this.access(binding);}
 private async trainingAccess(reselectAccount=false){
  if(!reselectAccount&&this.token&&this.now()<this.expiresAt)return {token:this.token,generation:this.generation};
  if(!this.prepared)await this.prepare();
  if(!this.prepared)throw Error(this.state.message||'Подключение Google не готово. Повторите позже.');
  if(['authorizing','choosing','checking'].includes(this.state.status))throw Error('Дождитесь завершения подключения Google.');
  const previous=this.state,generation=++this.generation;
  this.update({status:'authorizing',message:'Выберите аккаунт Google для учебной таблицы.'});
  try{
   const authorization=await this.gateway.authorize();
   if(generation!==this.generation){await this.gateway.revoke(authorization.token);throw Error('Подключение изменилось. Повторите действие.');}
   if(!authorization.token||!Number.isFinite(authorization.expiresIn)||authorization.expiresIn<=0)throw Error('Google не предоставил действующий доступ.');
   this.token=authorization.token;this.expiresAt=this.now()+authorization.expiresIn*1000;
   this.update({...previous,message:''});return {token:this.token,generation};
  }catch(error){if(generation===this.generation){this.token=null;this.expiresAt=0;this.update({...previous,status:'error',message:error instanceof Error?error.message:'Не удалось получить доступ Google.'});}throw error;}
 }
 async createTrainingWorkbook(title:string,sheets:string[],reselectAccount=false){
  if(!this.gateway.createTrainingWorkbook)throw Error('Создание учебной таблицы не поддерживается этой сборкой.');
  const access=await this.trainingAccess(reselectAccount),details=await this.gateway.createTrainingWorkbook(access.token,title,sheets);
  if(access.generation!==this.generation)throw Error('Подключение Google изменилось. Проверьте список таблиц, прежде чем повторять создание.');
  return details;
 }
 async writeTrainingSheets(id:string,sheets:TrainingSheet[]){
  const access=await this.trainingAccess();
  if(!this.gateway.writeTrainingSheets)throw Error('Запись учебной таблицы не поддерживается этой сборкой.');
  await this.gateway.writeTrainingSheets(access.token,id,sheets);
  if(access.generation!==this.generation)throw Error('Подключение Google изменилось во время записи. Откройте учебную таблицу и проверьте результат.');
 }
 async readTrainingSheets(id:string,names:string[]){
  const access=await this.trainingAccess();if(!this.gateway.readTrainingSheets)throw Error('Проверка учебной таблицы чтением недоступна.');
  const sheets=await this.gateway.readTrainingSheets(access.token,id,names);
  if(access.generation!==this.generation)throw Error('Подключение Google изменилось во время проверки.');
  return sheets;
 }
 async inspectTrainingWorkbook(id:string,reselectAccount=false){
  const access=await this.trainingAccess(reselectAccount),details=await this.gateway.inspect(access.token,id);
  if(access.generation!==this.generation)throw Error('Подключение Google изменилось. Повторите проверку учебной таблицы.');
  return details;
 }
 checkExpiry(){if(this.token&&this.now()>=this.expiresAt){this.token=null;this.update({status:'expired',message:'Доступ Google истёк. Подключите таблицу повторно.'});}}
 restoreSelection(selection:GoogleSelection|null){++this.generation;this.token=null;this.expiresAt=0;this.update({selection,sheets:[],status:this.prepared?(selection?'expired':'ready'):this.state.status,message:selection?'Таблица сохранена в проекте. Подтвердите доступ Google для подключения.':''});}
 async disconnect(){const token=this.token;++this.generation;this.token=null;this.expiresAt=0;this.update({selection:null,sheets:[],status:this.prepared?'ready':this.state.status,message:''});if(token)try{await this.gateway.revoke(token);}catch{this.update({message:'Локальное подключение отключено. Отозвать разрешение можно в настройках Google-аккаунта.'});}}
}
