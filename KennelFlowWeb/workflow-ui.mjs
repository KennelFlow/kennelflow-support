import {dayKey,dutyChecklist,dutyChange,scheduledItems,pedigree} from './workflows.mjs';
import {canWrite,newRecord,isoDate,recordName} from './records.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,run,cls='secondary')=>{const b=el('button',text,cls);b.type='button';b.onclick=run;return b};
export function createWorkflows({state,save,refresh,edit,add,choose,onError,onMessage,complete,report,showPedigree}){
 let dutySelection='',includeHistory=false;
 const live=type=>[...state().rows.values()].filter(r=>r.type===type&&!r.deleted_at);
 async function action(fn,target){if(target)target.disabled=true;try{await fn()}catch(e){onError(e)}finally{if(target)target.disabled=false}}
 function duties(host){
  const key=dutySelection||dayKey(),all=[...state().rows.values()],units=dutyChecklist(all,key),panel=el('section',undefined,'specialized-panel');
  panel.append(el('h3','Daily duty checklist'),el('p','A fresh checklist appears each day. Previous completions remain in saved history.','muted'));
  const label=el('label','Checklist date'),date=el('input');date.type='date';date.value=key;label.append(date);
  date.onchange=()=>{dutySelection=date.value;refresh(false)};
  panel.append(label,button('Today',()=>{dutySelection='';refresh(false)}));
  if(canWrite(state().role,'dailyDutyTemplates'))panel.append(button('Add duty',()=>add('dailyDutyTemplates')),button('Edit duty categories',()=>choose('dailyDutyShifts')));
  const names=[...new Set([...live('dailyDutyShifts').map(r=>r.record.name),...units.map(u=>u.shift)])];
  for(const shift of names){const group=el('section',undefined,'duty-group'),items=units.filter(u=>u.shift===shift);group.append(el('h3',shift),el('p',`${items.filter(u=>u.completed).length} of ${items.length} complete`,'muted'));
   for(const unit of items){const line=el('div',undefined,'specialized-line'),label=el('span',unit.title);line.append(label,el('span',unit.completed?'Completed':'Pending','badge'));
    if(canWrite(state().role,'dailyDutyRecords')){const toggle=button(unit.completed?'Reopen':'Complete',()=>action(async()=>{const scope=state().kennel,change=await dutyChange(unit,key);change.row.kennel=scope;await save(change.row,change.record);await refresh(true)},toggle));line.append(toggle)}
    if(unit.template&&canWrite(state().role,'dailyDutyTemplates'))line.append(button('Edit duty',()=>edit(unit.template)));
    if(unit.row?.record.completedAt)line.append(el('small',new Date(unit.row.record.completedAt).toLocaleString()));
    group.append(line);
   }
   if(!items.length)group.append(el('p','No duties in this category.','muted'));panel.append(group);
  }
  if(!names.length)panel.append(el('p','Add duty categories and templates to start your daily checklist.','muted'));
  host.append(panel);
 }
 function calendar(host,month,selectedDay,onSelect){
  const start=new Date(month.getFullYear(),month.getMonth(),1),end=new Date(month.getFullYear(),month.getMonth()+1,1);
  const items=scheduledItems([...state().rows.values()],start,end,{history:includeHistory});
  const history=el('label',undefined,'check'),check=el('input');check.type='checkbox';check.checked=includeHistory;check.onchange=()=>{includeHistory=check.checked;refresh(false)};history.append(check,el('span','Include completed activities'));host.append(history);
  const grid=el('div',undefined,'calendar-grid');for(const name of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])grid.append(el('small',name));for(let n=0;n<start.getDay();n++)grid.append(el('span'));
  for(let n=1;n<=new Date(end-1).getDate();n++){const key=dayKey(new Date(start.getFullYear(),start.getMonth(),n)),count=items.filter(item=>dayKey(item.date)===key).length,b=button(String(n),()=>onSelect(key),'');b.classList.toggle('selected',key===selectedDay);b.setAttribute('aria-label',key+` · ${count} scheduled activities`);b.append(el('small',`${count} activit${count===1?'y':'ies'}`));grid.append(b)}
  host.append(grid);
  if(!selectedDay){host.append(el('p','Tap a date to see its scheduled activities.','muted'));return}
  const agenda=el('section',undefined,'agenda');agenda.append(el('h3',new Date(selectedDay+'T12:00:00').toLocaleDateString(undefined,{dateStyle:'full'})));
  for(const item of items.filter(item=>dayKey(item.date)===selectedDay)){
   const box=el('article',undefined,'record');box.append(el('h3',item.title),el('p',item.source==='duties'?item.status:`${item.source} · ${new Date(item.date).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`,'muted'));
   if(item.source==='duties')box.append(button('Open daily duties',()=>{dutySelection=selectedDay;choose('dailyDutyRecords')}));
   else{
    const allowed=canWrite(state().role,item.row.type);
    box.append(button(allowed?'View / edit source':'View source',()=>{choose(item.row.type);if(allowed)edit(item.row)}));
    const repair=item.row.type==='calendarEvents'&&item.completed&&item.row.record.recurrence&&item.row.record.recurrence!=='Does Not Repeat'&&(!item.row.record.nextOccurrenceID||!state().rows.has(item.row.record.nextOccurrenceID));
    if(allowed&&(!item.completed||repair)&&['calendarEvents','tasks'].includes(item.row.type)){const b=button(repair?'Finish recurring schedule':'Complete',()=>action(()=>complete(item.row),b));box.append(b)}
   }
   agenda.append(box);
  }
  host.append(agenda);
 }
 function dogActions(row,actions){
  actions.append(button('Care profile',()=>{
   const name=row.record.name,sections=[['Profile',[row.record]],...['healthRecords','feedingPlans','supplementRecords','training','groomingRecords','kennelCareSessions'].map(type=>[type,live(type).filter(r=>[r.record.dogName,r.record.subjectName].some(v=>v?.toLowerCase()===name.toLowerCase())).map(r=>r.record)])];
   report(name+' · Care profile',sections);
  }),button('5-generation pedigree',()=>{
   const levels=pedigree(row.record,live('dogs').map(r=>r.record));
   showPedigree(row.record.name+' · 5-generation pedigree',levels);
  }));
 }
 function care(host){
  const panel=el('section',undefined,'specialized-panel');panel.append(el('h3','Record kennel care'));
  for(const row of live('kennels')){
   const box=el('article',undefined,'record');box.append(el('h3',row.record.name),el('p',row.record.assignedDog||'No assigned dog'));
   if(canWrite(state().role,'kennelCareSessions'))box.append(button('Add care checklist',()=>{
    const record=newRecord('KennelCareSession');record.kennelID=row.id;record.kennelName=row.record.name;record.dogName=row.record.assignedDog||'';record.staffID=state().identity.id;record.staffName=state().identity.name||state().identity.email;
    add('kennelCareSessions',record);
   }));panel.append(box);
  }host.append(panel);
 }
 function summary(host,type){
  const panel=el('section',undefined,'specialized-panel'),money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
  if(type==='puppies'){const puppies=live(type).map(r=>r.record);panel.append(el('h3','Puppy sale balances'));for(const p of puppies)panel.append(el('p',`${p.callName||p.registeredName} · ${p.buyerName||'No buyer'} · Balance ${money(Math.max(0,p.askingPrice-p.depositPaid-p.balancePaid))}`))}
  if(type==='boardingRecords'){panel.append(el('h3','Boarding balances'));for(const r of live(type)){const b=r.record;panel.append(el('p',`${b.petName} · ${b.ownerName} · Balance ${money(Math.max(0,b.totalCost-b.amountPaid))}`))}}
  if(type==='expenses'){panel.append(el('h3','Expense totals'));const groups=new Map();for(const r of live(type)){const key=r.record.customCategory||r.record.category;groups.set(key,(groups.get(key)||0)+r.record.amount)}for(const [category,total] of groups)panel.append(el('p',category+' · '+money(total)))}
  if(panel.children.length)host.append(panel);
 }
 return {duties,calendar,dogActions,care,summary,reset(){dutySelection='';includeHistory=false}};
}
