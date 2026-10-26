import test from 'node:test';
import assert from 'node:assert/strict';
import {models,collections} from '../public/schema.mjs';
import {newRecord,validateModel} from '../public/records.mjs';

test('client intake adds optional service, pet, feeding, medication and care fields without breaking old records',()=>{
 const keys=models.ClientRecord.map(f=>f.key);
 for(const field of ['services','petName','petBreed','petDOB','feedingPlan','medications','medicationSchedule','allergies','vaccinationNotes','veterinarian','groomingInstructions','trainingGoals','specialCareInstructions'])assert.ok(keys.includes(field),field);
 const old=newRecord('ClientRecord');
 old.name='Existing client';
 assert.equal(validateModel('ClientRecord',old),null);
 assert.equal(validateModel('ClientRecord',{...old,services:'Boarding, Grooming, Training',petName:'Scout',medications:'Prescription per owner',petDOB:'2023-05-10T00:00:00Z'}),null);
});
test('training records can persist linked clients, packages, sessions, trainer and goals',()=>{
 const fields=models.TrainingRecord.map(f=>f.key);
 for(const key of ['clientID','packageName','packageSessions','sessionsCompleted','packagePrice','trainerName','nextSession','sessionStatus','progressNotes','homework'])assert.ok(fields.includes(key),key);
 const r=newRecord('TrainingRecord');
 r.dogName='Scout';r.type='Obedience';
 assert.equal(validateModel('TrainingRecord',r),null);
 assert.equal(validateModel('TrainingRecord',{...r,packageName:'Six-session obedience',packageSessions:6,sessionsCompleted:1,trainerName:'Trainer',packagePrice:600}),null);
});
test('cloud record types remain the existing compatible client, boarding and training collections',()=>{
 assert.equal(collections.clients,'ClientRecord');
 assert.equal(collections.boardingRecords,'BoardingRecord');
 assert.equal(collections.training,'TrainingRecord');
});
