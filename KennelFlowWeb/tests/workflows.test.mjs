import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import {scanPixels} from '../scan-codecs.mjs';
import {tagPayload} from '../scanner.mjs';
import {dayKey,dutyChecklist,dutyChange,calendarCompletion,scheduledItems,nextDate,pedigree} from '../workflows.mjs';
const row=(type,record)=>({id:record.id||crypto.randomUUID(),type,revision:1,record,updated_at:'2026-10-16T00:00:00Z'});
test('daily duties reset by date, preserve history, and share one deterministic record across browser sessions',async()=>{
 const template=row('dailyDutyTemplates',{id:crypto.randomUUID(),title:'Water',shift:'Morning'}),shift=row('dailyDutyShifts',{name:'Morning'}),rows=[template,shift];
 const unit=dutyChecklist(rows,'2026-10-16')[0];assert.equal(unit.completed,false);
 const first=await dutyChange(unit,'2026-10-16'),second=await dutyChange(unit,'2026-10-16');assert.equal(first.row.id,second.row.id);assert.equal(first.record.completed,true);
 const saved={...first.row,revision:1,record:first.record};
 assert.equal(dutyChecklist([...rows,saved],'2026-10-16')[0].completed,true);
 assert.equal(dutyChecklist([...rows,saved],'2026-10-17')[0].completed,false);
 const reopened=await dutyChange(dutyChecklist([...rows,saved],'2026-10-16')[0],'2026-10-16');assert.equal(reopened.record.completed,false);assert.equal(reopened.record.completedAt,undefined);
 assert.equal(saved.record.completed,true);
 assert.equal(dutyChecklist([template,{...shift,deleted_at:'2026-10-16'}],'2026-10-16').length,0);
});
test('recurring calendar completion preserves duration, clamps month ends, and retries the same next occurrence',async()=>{
 const source=row('calendarEvents',{id:crypto.randomUUID(),title:'Inspect kennel',startDate:'2026-01-31T09:00:00Z',endDate:'2026-01-31T10:00:00Z',recurrence:'Monthly'});
 const {current,next}=await calendarCompletion(source,new Date('2026-02-01T12:00:00Z'));
 assert.equal(next.startDate,'2026-02-28T09:00:00Z');assert.equal(next.endDate,'2026-02-28T10:00:00Z');assert.ok(current.completedAt);assert.equal(next.completedAt,undefined);
 const retry=await calendarCompletion({...source,record:current});assert.equal(retry.next.id,next.id);assert.equal(retry.current.history.length,1);
 assert.equal(nextDate('2024-02-29T12:00:00Z','Yearly'),'2025-02-28T12:00:00Z');
});
test('calendar projects one daily-duty item, linked record schedules, feeding and boarding medication without writing duplicates',()=>{
 const id=crypto.randomUUID(),rows=[row('tasks',{id,title:'Vet visit',dueDate:'2026-10-16T12:00:00Z',completed:false}),row('calendarEvents',{id:crypto.randomUUID(),title:'Linked vet visit',startDate:'2026-10-16T12:00:00Z',linkedType:'Task',linkedID:id}),row('feedingPlans',{subjectName:'Rex',isActive:true,startDate:'2026-10-01T00:00:00Z',mealsPerDay:2,feedingTimes:'Morning and evening'}),row('boardingRecords',{petName:'Boarder',dropOffDate:'2026-10-16T00:00:00Z',pickupDate:'2026-10-17T00:00:00Z',medications:'Saved medication',medicationDose:'Saved dose',medicationSchedule:'Saved schedule'})];
 const items=scheduledItems(rows,new Date('2026-10-16T00:00:00'),new Date('2026-10-17T00:00:00'));
 assert.equal(items.filter(i=>i.source==='duties').length,1);assert.equal(items.filter(i=>i.row?.type==='tasks').length,0);assert.equal(items.filter(i=>i.source==='Feeding').length,1);assert.equal(items.filter(i=>i.source==='Boarding medication').length,1);assert.equal(rows.length,4);
});
test('pedigree preserves sire/dam order through five generations and labels missing data',()=>{
 const sire={name:'Sire',sire:'Grand sire'},dam={name:'Dam'},dog={name:'Pup',sire:'Sire',dam:'Dam'};
 const levels=pedigree(dog,[dog,sire,dam,{name:'Grand sire'}]);assert.deepEqual(levels.map(level=>level.length),[1,2,4,8,16,32]);assert.equal(levels[1][0].name,'Sire');assert.equal(levels[1][1].name,'Dam');assert.equal(levels[2][0].name,'Grand sire');assert.equal(levels[2][3].name,'Not recorded');
});
test('generated smart-tag QR is decoded by the browser reader and uses the native deep link',()=>{
 const payload=tagPayload({id:crypto.randomUUID()}),matrix=QRCode.create(payload,{errorCorrectionLevel:'M'}).modules,scale=6,margin=4,size=(matrix.size+margin*2)*scale,pixels=new Uint8ClampedArray(size*size*4).fill(255);
 for(let y=0;y<matrix.size;y++)for(let x=0;x<matrix.size;x++)if(matrix.get(y,x))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const offset=(((y+margin)*scale+dy)*size+(x+margin)*scale+dx)*4;pixels[offset]=pixels[offset+1]=pixels[offset+2]=0}
 assert.equal(scanPixels(pixels,size,size),payload);assert.match(payload,/^kennelflow:\/\/smart\/[0-9A-F-]{36}$/);assert.equal(tagPayload({id:'unused',externalQRPayload:'existing-code'}),'existing-code');
});
