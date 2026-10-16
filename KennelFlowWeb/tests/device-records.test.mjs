import {test} from 'node:test';
import assert from 'node:assert/strict';
import {models,collections,newRecord,validateModel} from '../records.mjs';
const types=['maintenanceRecords','ofaXrays','clinics','vetServices','employeeProfiles','messages','locations','pedigreeAncestors','pedigreeScans'];
test('all nine device record models are modeled and require native-compatible fields',()=>{
 for(const type of types){
  const model=collections[type];assert.ok(model);const record=newRecord(model);
  if(type==='maintenanceRecords'){assert.match(validateModel(model,record),/kennelID/);record.kennelID='00000000-0000-0000-0000-000000000011'}
  assert.equal(validateModel(model,record),null,`${type} initial data invalid`);
  assert.ok(models[model].some(f=>f.key==='id'));
 }
});
test('maintenance records require a kennel area ID and preserve optional attached filenames',()=>{
 const record=newRecord(collections.maintenanceRecords);
 assert.match(validateModel(collections.maintenanceRecords,record),/kennelID/);
 record.kennelID='00000000-0000-0000-0000-000000000011';
 record.attachments=['receipt.pdf'];record.attachmentNames={'receipt.pdf':'Receipt'};
 assert.equal(validateModel(collections.maintenanceRecords,record),null);
});
