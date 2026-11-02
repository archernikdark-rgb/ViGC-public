import type { WorkspaceDocument, WorkspaceParameter } from './document.ts';

// IDs and owners identify instances, not the editable definition.
export function parameterSignature(document: WorkspaceDocument, parameter: WorkspaceParameter): string {
  const controls=parameter.controls;
  const node=parameter.sourceNodeId && document.logic.nodes.find(item=>item.id===parameter.sourceNodeId);
  let source:unknown=null;
  if (parameter.sourceNodeId) {
    if (!node) source={missing:parameter.sourceNodeId};
    else if (node.data.role==='calculate' && node.data.calculation) source={role:'calculate',expression:node.data.calculation.expression,inputs:node.data.calculation.inputs.map(input=>({alias:input.alias,edges:document.logic.edges.filter(edge=>edge.target===node.id&&edge.targetHandle===input.id).map(edge=>[edge.source,edge.sourceHandle]).sort()}))};
    else if (node.data.role==='variable') source={role:'variable',value:node.data.variableValue};
    else source={node:parameter.sourceNodeId};
  }
  return JSON.stringify({name:parameter.name,value:parameter.value,min:controls?.min??null,max:controls?.max??null,step:controls?.step??null,source});
}

export function commonParameterGroups(document: WorkspaceDocument, ownerIds:string[]): {ids:string[];parameter:WorkspaceParameter}[] {
  const owners=[...new Set(ownerIds)];
  if(owners.length<2)return [];
  const first=document.parameters.filter(p=>p.ownerId===owners[0]);
  return first.flatMap(parameter=>{
    const signature=parameterSignature(document,parameter);
    const matches=owners.map(owner=>document.parameters.filter(p=>p.ownerId===owner&&parameterSignature(document,p)===signature));
    return matches.every(list=>list.length===1)?[{ids:matches.map(list=>list[0]!.id),parameter}]:[];
  });
}

export function canEditCommonFormula(document:WorkspaceDocument, ids:string[]):boolean {
  const parameters=ids.map(id=>document.parameters.find(p=>p.id===id));
  if(parameters.some(p=>!p?.sourceNodeId))return false;
  const sources=new Set(parameters.map(p=>p!.sourceNodeId!));
  if([...sources].some(id=>{const node=document.logic.nodes.find(n=>n.id===id);return node?.data.role!=='calculate'||!node.data.calculation;}))return false;
  const selected=new Set(ids);
  return !document.parameters.some(p=>p.sourceNodeId&&sources.has(p.sourceNodeId)&&!selected.has(p.id)) && !document.logic.edges.some(e=>sources.has(e.source));
}
