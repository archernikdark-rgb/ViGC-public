export class SavePolicy {
 enabled=false;
 private generation=0;
 private edits:{generation:number;key:string;time:number}[]=[];
 get actions(){return this.edits.length;}
 changed(key:string,time:number){
  const last=this.edits.at(-1);const generation=++this.generation;
  if(last?.key===key)last.generation=generation;
  else this.edits.push({generation,key,time});
 }
 ticket(){return this.generation;}
 saved(ticket:number,_time:number){this.enabled=true;this.edits=this.edits.filter(edit=>edit.generation>ticket);}
 due(time:number){return this.enabled&&this.actions>0&&(this.actions>=10||time-this.edits[0].time>=300000);}
}
