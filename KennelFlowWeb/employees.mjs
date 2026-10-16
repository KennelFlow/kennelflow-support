const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.onclick=fn;return n};
const field=(text,type='text')=>{const label=el('label',text),input=el('input');input.type=type;label.append(input);return {label,input}};
const managing=role=>['owner','admin'].includes(role);
const canManage=(role,target)=>target!=='owner'&&(role==='owner'||role==='admin'&&['staff','viewer'].includes(target));
const date=value=>new Date(value).toLocaleString();
export function hours(entry,from,to,now=Date.now()){
 const start=Math.max(Date.parse(entry.clockIn),from),end=Math.min(entry.clockOut==null?now:Date.parse(entry.clockOut),to);
 return Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,end-start)/3600000:0;
}
export function createEmployees({host,api,state,onMembers,onError,refresh,edit,add}){
 let generation=0,events=[],nextCursor=null,scope='',selected='',from='',to='';
 const path=resource=>`kennels/${state().kennel}/${resource}`;
 const attempt=async(fn,b)=>{if(b)b.disabled=true;try{await fn()}catch(e){onError(e)}finally{if(b)b.disabled=false}};
 function reset(){generation++;events=[];nextCursor=null;scope='';selected='';host.replaceChildren()}
 async function render(background=false){
  if(background&&(host.contains(document.activeElement)||host.querySelector('.invite-result input')||host.querySelector('.employee-form input')?.value||host.querySelector('[data-access-dirty]')))return;
  const current=state(),key=current.kennel+'|'+current.identity.id;
  if(scope!==key){events=[];nextCursor=null;selected='';from='';to='';scope=key}
  const run=++generation,manager=managing(current.role);
  try{
   const [members,pending,clock,history]=await Promise.all([
    manager?api(path('members')):Promise.resolve({members:[]}),
    manager?api(path('invitations')):Promise.resolve({invitations:[]}),
    current.role==='viewer'?Promise.resolve({record:null}):api(path('clock')),
    api(path('history'))
   ]);
   if(run!==generation||scope!==key)return;
   events=history.events;nextCursor=history.nextCursor;onMembers(members.members);host.replaceChildren();
   host.append(el('p','PEOPLE & WORK','eyebrow'),el('h2','Employees'),el('p','Manage access, review work, and track hours. Work history records cloud saves from the website and connected apps. Offline changes appear after syncing.','muted'));
   if(current.role!=='viewer')renderClock(clock.record);
   if(manager){renderInvite();renderMembers(members.members);renderPending(pending.invitations)}
   renderTime(members.members);renderHistory();
  }catch(e){if(run===generation){host.replaceChildren(el('h2','Employees'),el('p',e.message,'employee-error'),button('Retry',()=>render()));onError(e)}}
 }
 function renderClock(row){
  const box=el('section',undefined,'record'),open=row&&!row.deleted_at&&!row.data?.record?.clockOut;
  box.append(el('h3','My time clock'),el('p',open?'Clocked in since '+date(row.data.record.clockIn):'You are clocked out.'));
  const action=button(open?'Clock out':'Clock in',()=>attempt(async()=>{await api(path('clock'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:open?'out':'in'})});await refresh()},action),'');box.append(action);host.append(box);
 }
 function renderInvite(){
  const box=el('section',undefined,'record'),form=el('form',undefined,'employee-form'),email=field('Employee email','email'),role=el('select'),label=el('label','Access role');email.input.required=true;
  for(const value of state().role==='owner'?['staff','viewer','admin']:['staff','viewer']){const o=el('option',value==='staff'?'Employee — care and duties':value==='viewer'?'Viewer — read only':'Admin — team and kennel management');o.value=value;role.append(o)}label.append(role);
  const submit=el('button','Create invitation'),result=el('div',undefined,'invite-result');submit.type='submit';
  form.append(email.label,label,submit);form.onsubmit=e=>{e.preventDefault();attempt(async()=>{
   const value=await api(path('invitations'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.input.value,role:role.value})});
   const link=new URL('/',window.location.origin);link.hash='invite='+value.token;
   result.replaceChildren(el('p',`Invitation created for ${value.email}. It expires in 48 hours. Share this link directly with that employee; no email has been sent.`));
   const output=field('Employee invitation link');output.input.readOnly=true;output.input.value=link.href;result.append(output.label,button('Copy invitation link',()=>attempt(async()=>{await navigator.clipboard.writeText(link.href);copyStatus.textContent='Invitation link copied.'})));
   const copyStatus=el('p');copyStatus.setAttribute('role','status');result.append(copyStatus);
   const list=await api(path('invitations'));const existing=host.querySelector('[data-pending]');if(existing)existing.replaceWith(pendingBox(list.invitations));
  },submit)};
  box.append(el('h3','Add employee'),el('p','Each person uses their own Business account. An invitation grants access after they accept it.','muted'),form,result);host.append(box);
 }
 function renderMembers(members){
  const section=el('section',undefined,'employee-section');section.append(el('h3','Team members'));
  for(const member of members){
   const box=el('article',undefined,'record'),actions=el('div',undefined,'toolbar');box.append(el('h3',member.name||member.email),el('p',`${member.email} · ${member.role}`));
   if(canManage(state().role,member.role)){
    const role=el('select'),label=el('label','Access for '+(member.name||member.email));for(const value of state().role==='owner'?['staff','viewer','admin']:['staff','viewer']){const option=el('option',value);option.value=value;role.append(option)}role.value=member.role;label.append(role);
    role.onchange=()=>role.dataset.accessDirty='true';
    const save=button('Save access',()=>{if(!confirm(`Change access for ${member.name||member.email} to ${role.value}? Their current sessions will end.`))return;attempt(()=>changeMember(member,role.value,false),save)});
    const remove=button('Remove access',()=>{if(!confirm(`Remove ${member.name||member.email} from this kennel? Their work history is retained. You can invite them again.`))return;attempt(()=>changeMember(member,member.role,true),remove)},'danger');actions.append(label,save,remove);
   }else actions.append(el('p',member.role==='owner'?'Owner access is protected.':'Managed by the owner.','muted'));
   box.append(actions);section.append(box);
  }host.append(section);
 }
 async function changeMember(member,role,remove){await api(path('members/'+member.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,remove})});await refresh()}
 function pendingBox(items){
  const section=el('section',undefined,'employee-section');section.dataset.pending='true';section.append(el('h3','Pending invitations'));
  if(!items.length)section.append(el('p','No pending invitations.','muted'));
  for(const invitation of items){const box=el('article',undefined,'record');box.append(el('p',`${invitation.email} · ${invitation.role} · Expires ${date(invitation.expires_at)}`));
   if(canManage(state().role,invitation.role)){const cancel=button('Cancel invitation',()=>{if(!confirm('Cancel the invitation for '+invitation.email+'?'))return;attempt(async()=>{await api(path('invitations/'+invitation.id),{method:'DELETE'});await render()},cancel)},'danger');box.append(cancel)}section.append(box)}return section;
 }
 function renderPending(items){host.append(pendingBox(items))}
 function renderTime(members){
  const box=el('section',undefined,'employee-section'),filters=el('div',undefined,'filters'),person=el('select'),label=el('label','Employee'),start=field('From','date'),end=field('Through','date'),now=new Date();
  if(!from)from=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;if(!to)to=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const all=el('option',managing(state().role)?'All employees':'My entries');all.value='';person.append(all);
  const people=new Map(members.map(m=>[m.id,m.name||m.email]));
  const entries=[...state().rows.values()].filter(r=>r.type==='staffTimeEntries'&&!r.deleted_at&&r.record);
  for(const row of entries)people.set(row.record.staffID,row.record.staffName);
  for(const [id,name] of people){const option=el('option',name);option.value=id;person.append(option)}person.value=selected;label.append(person);start.input.value=from;end.input.value=to;filters.append(label,start.label,end.label);
  const summary=el('p',undefined,'time-summary'),list=el('div');
  function show(){
   selected=person.value;from=start.input.value;to=end.input.value;
   const a=Date.parse(from+'T00:00:00'),d=new Date(to+'T00:00:00');d.setDate(d.getDate()+1);const b=d.getTime();list.replaceChildren();
   if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b){summary.textContent='Choose a valid date range.';return}
   const filtered=entries.filter(r=>(!selected||r.record.staffID===selected)&&Date.parse(r.record.clockIn)<b&&(r.record.clockOut==null||Date.parse(r.record.clockOut)>=a));
   summary.textContent=filtered.reduce((sum,r)=>sum+hours(r.record,a,b),0).toFixed(2)+' hours in this period · Open entries include elapsed time so far.';
   for(const row of filtered.sort((a,b)=>b.record.clockIn.localeCompare(a.record.clockIn))){const card=el('article',undefined,'record');card.append(el('h3',row.record.staffName),el('p',date(row.record.clockIn)+' → '+(row.record.clockOut?date(row.record.clockOut):'Clocked in')),el('p',hours(row.record,a,b).toFixed(2)+' hours in selected period'));
    if(managing(state().role))card.append(button('Correct time entry',()=>edit(row)));list.append(card)}
   if(!filtered.length)list.append(el('p','No time entries in this period.','muted'));
  }
  person.onchange=show;start.input.onchange=show;end.input.onchange=show;box.append(el('h3','Time entries & hours'),filters,summary);
  if(managing(state().role))box.append(button('Add time entry',()=>add('staffTimeEntries')));
  box.append(button('Print hours',()=>window.print()),list);show();host.append(box);
 }
 function renderHistory(){
  const box=el('section',undefined,'employee-section');box.append(el('h3','Work history'),el('p','Automatically recorded cloud changes. History starts when employee tracking was enabled. It records who saved each change; manual activity records remain under Staff Records.','muted'));
  const search=field('Search work history','search'),list=el('div'),more=button('Load older work',()=>attempt(async()=>{const run=generation,key=scope;const value=await api(path('history')+'?before='+encodeURIComponent(nextCursor));if(run!==generation||scope!==key)return;events.push(...value.events);nextCursor=value.nextCursor;show()},more));
  function show(){list.replaceChildren();const term=search.input.value.toLowerCase();for(const event of events.filter(e=>[e.actor_name,e.record_type,e.action,e.title].join(' ').toLowerCase().includes(term))){const card=el('article',undefined,'record');card.append(el('h3',event.actor_name),el('p',`${event.action} · ${event.record_type} · ${event.title}`),el('p',`${date(event.created_at)} · Revision ${event.revision}`,'muted'));list.append(card)}if(!list.children.length)list.append(el('p','No matching work history yet.','muted'));more.hidden=!nextCursor}
  search.input.oninput=show;box.append(search.label,list,more);show();host.append(box);
 }
 return {render,reset};
}
