import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDisplayRecords} from '../records.mjs';
const row=(name,updated='2026-10-16T12:00:00Z')=>({record:{name},updated_at:updated,id:name});
test('kennel names use human numeric order, not creation dates or lexicographic order',()=>{
 const input=['Run 4','Run 10','Run 6','Run 2','Run 1','Run 3','Run 7','Run 5']
   .map((name,index)=>row(name,new Date(Date.UTC(2026,9,16,index)).toISOString()));
 assert.deepEqual(input.sort((a,b)=>compareDisplayRecords(a,b,'kennels')).map(x=>x.record.name),
  ['Run 1','Run 2','Run 3','Run 4','Run 5','Run 6','Run 7','Run 10']);
});
test('numbered directories on every menu are natural sorted; date-based payment and calendar lists are unchanged',()=>{
 for(const collection of ['dogs','puppies','litters','kennels','equipment','clients','customers',
   'scanFolders','inventoryLocations','inventoryItems','smartTags','clinics','employeeProfiles']){
  const names=[row('Area 12','2026-10-16T13:00:00Z'),row('Area 2','2026-10-16T12:00:00Z'),row('Area 1','2026-10-16T11:00:00Z')]
    .sort((a,b)=>compareDisplayRecords(a,b,collection)).map(a=>a.record.name);
  assert.deepEqual(names,['Area 1','Area 2','Area 12'],collection);
 }
 for(const collection of ['payments','calendarEvents','healthRecords','expenses','maintenanceRecords']){
  const records=[row('Job 2','2026-10-16T13:00:00Z'),row('Job 1','2026-10-16T11:00:00Z')]
   .sort((a,b)=>compareDisplayRecords(a,b,collection));
  assert.equal(records[0].record.name,'Job 2',collection);
 }
});
