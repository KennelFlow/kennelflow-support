import {isoDate} from './records.mjs';

export function dayKey(value=new Date()) {
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function dutyChecklist(rows,key=dayKey()) {
 const live=rows.filter(r=>!r.deleted_at);
 const shifts=live.filter(r=>r.type==='dailyDutyShifts').map(r=>r.record.name);
 const templates=live.filter(r=>r.type==='dailyDutyTemplates');
 const saved=live.filter(r=>r.type==='dailyDutyRecords'&&r.record.dateKey===key);
 const units=templates.filter(r=>shifts.includes(r.record.shift)).map(template=>{
  const matches=saved.filter(r=>r.record.templateID.toLowerCase()===template.id.toLowerCase()&&r.record.shift===template.record.shift);
  const row=matches.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  return {template,row,title:template.record.title,shift:template.record.shift,completed:row?.record.completed===true};
 });
 for(const row of saved)if(!units.some(u=>u.row?.id===row.id||u.template?.id.toLowerCase()===row.record.templateID.toLowerCase()&&u.shift===row.record.shift))units.push({row,title:row.record.taskTitle,shift:row.record.shift,completed:row.record.completed===true,historical:true});
 return units.sort((a,b)=>a.shift.localeCompare(b.shift)||a.title.localeCompare(b.title));
}
export async function stableID(value) {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 const h=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export async function dutyChange(unit,key,now=new Date()) {
 const id=unit.row?.id||await stableID(`kennelflow-duty|${key}|${unit.template.id.toLowerCase()}|${unit.shift}`);
 const record=unit.row?structuredClone(unit.row.record):{id,dateKey:key,shift:unit.shift,templateID:unit.template.id,taskTitle:unit.title,completed:false};
 record.completed=!record.completed;
 if(record.completed)record.completedAt=isoDate(now);else delete record.completedAt;
 return {row:unit.row||{id,type:'dailyDutyRecords',revision:0},record};
}
export function nextDate(value,rule) {
 const date=new Date(value);if(!Number.isFinite(date.getTime())||!rule||rule==='Does Not Repeat')return null;
 const day=date.getDate();
 if(rule==='Daily'||rule==='Weekly')date.setDate(day+(rule==='Daily'?1:7));
 else if(rule==='Monthly'){date.setDate(1);date.setMonth(date.getMonth()+1);date.setDate(Math.min(day,new Date(date.getFullYear(),date.getMonth()+1,0).getDate()))}
 else if(rule==='Yearly'){date.setDate(1);date.setFullYear(date.getFullYear()+1);date.setDate(Math.min(day,new Date(date.getFullYear(),date.getMonth()+1,0).getDate()))}
 else return null;
 return isoDate(date);
}
export async function calendarCompletion(row,now=new Date()) {
 const current=structuredClone(row.record);if(current.deletedAt)return {current,next:null};
 if(!current.completedAt){current.completedAt=isoDate(now);current.history=[...(current.history||[]),{id:crypto.randomUUID(),date:isoDate(now),action:'Completed'}]}
 let next=null;const start=nextDate(current.startDate,current.recurrence);
 if(start){
  const id=current.nextOccurrenceID||await stableID('kennelflow-calendar-next|'+current.id.toLowerCase());
  current.nextOccurrenceID=id;next={...structuredClone(current),id,startDate:start,history:[{id:crypto.randomUUID(),date:isoDate(now),action:'Recurring occurrence created'}]};
  delete next.completedAt;delete next.nextOccurrenceID;delete next.deletedAt;
  if(current.endDate)next.endDate=isoDate(new Date(start).getTime()+new Date(current.endDate).getTime()-new Date(current.startDate).getTime());
 }
 return {current,next};
}
export function scheduledItems(rows,start,end,{history=false}={}) {
 const live=rows.filter(r=>!r.deleted_at),items=[];
 const linked=new Set(live.filter(r=>r.type==='calendarEvents'&&!r.record.deletedAt&&r.record.linkedID).map(r=>r.record.linkedType.toLowerCase()+r.record.linkedID.toLowerCase()));
 const add=(row,title,date,suffix='',completed=false,source=row.type)=>{const time=new Date(date).getTime();if(Number.isFinite(time)&&time>=start.getTime()&&time<end.getTime()&&(history||!completed))items.push({id:row.id+suffix,row,title,date,completed,source})};
 for(const row of live){const r=row.record;
  if(row.type==='calendarEvents'&&(history||!r.deletedAt))add(row,r.title,r.startDate,'',!!r.completedAt);
  if(row.type==='tasks'&&!linked.has('task'+row.id.toLowerCase()))add(row,r.title,r.dueDate,'',!!r.completed);
  if(row.type==='healthRecords'&&!linked.has('health'+row.id.toLowerCase()))add(row,`${r.dogName} · ${r.category}: ${r.detail}`,r.nextDue||r.date);
  if(row.type==='breedingRecords'&&!linked.has('breeding'+row.id.toLowerCase())){add(row,`${r.femaleName} · ${r.eventType}`,r.date);if(r.estimatedDueDate)add(row,`${r.femaleName} · Expected due`,r.estimatedDueDate,'-due');if(r.reminderDate)add(row,`${r.femaleName} · Follow-up`,r.reminderDate,'-reminder')}
  if(row.type==='litters'){add(row,`${r.name} · Expected whelping`,r.dueDate);if(r.whelpDate)add(row,`${r.name} · Whelped`,r.whelpDate,'-whelp',true)}
  if(row.type==='training')add(row,`${r.dogName} · ${r.type}`,r.date);
  if(row.type==='groomingRecords')add(row,`${r.dogName} · Grooming`,r.nextDue||r.date);
  if(row.type==='supplementRecords'&&r.isActive&&r.nextDue)add(row,`${r.subjectName} · ${r.supplementName}`,r.nextDue);
  if(row.type==='boardingRecords'){add(row,`${r.petName} · Boarding arrival`,r.dropOffDate,'-in');add(row,`${r.petName} · Boarding pickup`,r.pickupDate,'-out')}
 }
 for(let day=new Date(start);day<end;day.setDate(day.getDate()+1)){
  const key=dayKey(day),units=dutyChecklist(live,key),completed=units.length>0&&units.every(u=>u.completed);
  items.push({id:'daily-duties-'+key,title:'Daily Duties',date:isoDate(day),source:'duties',completed,status:!units.length?'No duties scheduled':completed?'Completed':units.some(u=>u.completed)?'In progress':'Not started',key});
  for(const row of live){const r=row.record;
   if(row.type==='feedingPlans'&&r.isActive&&dayKey(r.startDate)<=key)add(row,`${r.subjectName} · ${r.mealsPerDay} meals · ${r.feedingTimes}`,day,'-'+key,false,'Feeding');
   if(row.type==='boardingRecords'&&r.medications?.trim()&&dayKey(r.dropOffDate)<=key&&key<=dayKey(r.pickupDate))add(row,`${r.petName} · ${r.medications} · ${r.medicationDose} · ${r.medicationSchedule}`,day,'-med-'+key,false,'Boarding medication');
  }
 }
 return items.sort((a,b)=>new Date(a.date)-new Date(b.date)||a.id.localeCompare(b.id));
}
export function pedigree(dog,dogs,generations=5) {
 const levels=[];let current=[{name:dog.name,record:dog,path:''}];
 for(let generation=0;generation<=generations;generation++){
  levels.push(current);if(generation===generations)break;
  current=current.flatMap(node=>['sire','dam'].map(side=>{const name=node.record?.[side]||'';const record=dogs.find(d=>d.name?.toLowerCase()===name.toLowerCase()||name&&d.registeredName?.toLowerCase()===name.toLowerCase());return {name:name||'Not recorded',record,path:node.path+(side==='sire'?'S':'D')}}));
 }
 return levels;
}
