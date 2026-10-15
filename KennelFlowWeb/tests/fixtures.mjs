import {models,collections,newRecord} from '../records.mjs';
export function fixture(model){
  const record=newRecord(model);
  for(const f of models[model]){
    if(f.optional)continue;
    if(f.type==='UUID'&&!record[f.key])record[f.key]=crypto.randomUUID();
    if(f.type==='String'&&!record[f.key])record[f.key]=f.key==='fileName'?'test.txt':'Test '+f.key;
    if(f.type.startsWith('[')&&models[f.type.slice(1,-1)])record[f.key]=[fixture(f.type.slice(1,-1))];
  }
  return record;
}
export const fixtures=()=>Object.fromEntries(Object.entries(collections).map(([type,model])=>[type,fixture(model)]));
