import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {graphScenario,graphScenarioNames,compactScenario} from '../src/engine/graph-scenarios.ts';
const directory=resolve(process.argv[2]??'Documents/Agents/Node-Design/Verification');await mkdir(directory,{recursive:true});
const compact=process.argv.includes('--compact');
for(const [id,name]of Object.entries(graphScenarioNames).filter(([id])=>!compact||['detection','combat'].includes(id))){
 const project=resolve(directory,`${id}.json`),commands=resolve(directory,`${id}-commands.json`);
 const init=execFileSync(process.execPath,['scripts/vigc.mjs','init',project,name],{encoding:'utf8'});
 await writeFile(commands,JSON.stringify(compact?compactScenario(id):graphScenario(id),null,2)+'\n');
 const result=execFileSync(process.execPath,['scripts/vigc.mjs','apply',project,commands],{encoding:'utf8'});
 await writeFile(resolve(directory,`${id}-cli.log`),init+result);console.log(`${id}: built through CLI → ${project}`);
}
