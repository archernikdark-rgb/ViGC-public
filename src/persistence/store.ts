import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { SavedProject } from './project.ts';
import { restoreProject } from './project.ts';
export interface ProjectRecord { id:string; name:string; updated:number; project:SavedProject }
interface ProjectsDB extends DBSchema { projects:{key:string;value:ProjectRecord} }
const database=()=>openDB<ProjectsDB>('vigc-projects',1,{upgrade(db){db.createObjectStore('projects',{keyPath:'id'});}});
export async function saveProject(project:SavedProject,expectedUpdated:number|null):Promise<ProjectRecord>{
 restoreProject(project);
 const db=await database();try {
  const transaction=db.transaction('projects','readwrite');const existing=await transaction.store.get(project.document.id);
  if(existing&&existing.updated!==expectedUpdated){await transaction.done;throw new Error('Этот проект уже сохранён в другой вкладке. Текущие правки остались в памяти; откройте актуальный проект перед перезаписью.');}
  const record={id:project.document.id,name:project.document.name,updated:Math.max(Date.now(),(existing?.updated??0)+1),project};
  await transaction.store.put(record);await transaction.done;return record;
 }finally{db.close();}
}
export async function recentProjects(){const db=await database();try{return (await db.getAll('projects')).map(({id,name,updated})=>({id,name,updated})).sort((a,b)=>b.updated-a.updated);}finally{db.close();}}
export async function loadProject(id:string):Promise<ProjectRecord>{const db=await database();try{const record=await db.get('projects',id);if(!record)throw new Error('Сохранённый проект не найден.');restoreProject(record.project);return record;}finally{db.close();}}
