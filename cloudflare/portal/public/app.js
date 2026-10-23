import {createEmployees} from './employees.mjs';
import {createWorkflows} from './workflow-ui.mjs';
import {calendarCompletion,dayKey,dutyChecklist,dutyChange,stableID} from './workflows.mjs';
import {attachScanner,tagPayload} from './scanner.mjs';
import {catalog,breedColors,breedCoats} from './catalog.mjs';
import {models,collections,canRead,canWrite,newRecord,normalizedRow,recordName,compareDisplayRecords,validateModel,isoDate,uuid} from './records.mjs';
const $=id=>document.getElementById(id);
const labels={dogs:'Dogs',puppies:'Puppies',litters:'Litters',breedingRecords:'Breeding records',healthRecords:'Health records',puppyMedicalRecords:'Puppy medical records',customers:'Puppy buyers',clients:'Clients',tasks:'Tasks',training:'Training',equipment:'Equipment',kennels:'Kennels / areas',documents:'Photos & documents',contracts:'Contracts',payments:'Payments',groomingRecords:'Grooming',feedingPlans:'Feeding plans',supplementRecords:'Supplements',semenRecords:'Semen records',scanFolders:'Report folders',scannedReports:'Scanned reports',boardingRecords:'Boarding',calendarEvents:'Calendar events',employeeActivity:'Employee activity',staffTimeEntries:'Staff time entries',kennelCareSessions:'Kennel care',expenses:'Expenses',dailyDutyShifts:'Duty categories',dailyDutyTemplates:'Duty templates',dailyDutyRecords:'Duty records',smartTags:'QR / NFC assignments',inventoryLocations:'Inventory locations',inventoryItems:'Inventory items',travelManifests:'Travel manifests',inventoryScans:'Inventory scans',inventoryReports:'Inventory reports',smartPlacements:'Tag placements',maintenanceRecords:'Maintenance records',ofaXrays:'OFA / X-ray records',clinics:'Veterinary clinics',vetServices:'Veterinary services',employeeProfiles:'Employee profiles',messages:'Messages',locations:'Employee locations',pedigreeAncestors:'Pedigree ancestors',pedigreeScans:'Pedigree scans'};
const groups={
  Overview:[],
  'Dog Records':['dogs'],
  'Puppy & Litter Records':['puppies','litters'],
  'Breeding Management':['breedingRecords','semenRecords'],
  'Kennel Operations':['kennels','kennelCareSessions'],
  'Client Management':['clients','customers'],
  'Boarding Management':['boardingRecords'],
  'Health Records':['healthRecords','puppyMedicalRecords','ofaXrays','clinics','vetServices'],
  'Grooming Records':['groomingRecords'],
  'Nutrition & Supplements':['feedingPlans','supplementRecords'],
  'Daily Operations':['dailyDutyRecords','dailyDutyTemplates','dailyDutyShifts'],
  'Scheduling':['calendarEvents','tasks'],
  'Dog Training Management':['training'],
  'Maintenance Management':['maintenanceRecords'],
  'Equipment & Inventory':['equipment','inventoryItems','inventoryLocations'],
  'Financial Records':['expenses','payments'],
  'Contracts & Agreements':['contracts'],
  'Documents & Media':['documents','scannedReports','scanFolders'],
  'Smart Tag Management':['smartTags','smartPlacements'],
  'Travel & Reporting':['travelManifests','inventoryScans','inventoryReports','pedigreeAncestors','pedigreeScans'],
  'Staff Management':['employeeActivity','staffTimeEntries','employeeProfiles','messages','locations'],
  'Employee Management':[]
};
const moduleDescriptions={
  'Dog Records':'Profiles, registrations, ownership and individual dog histories.',
  'Puppy & Litter Records':'Litter planning, puppy profiles and development records.',
  'Breeding Management':'Breeding history, pairing records and semen inventory.',
  'Kennel Operations':'Kennel assignments, facility activity and care sessions.',
  'Client Management':'Client directory, contact details, enrolled services and pet-care profiles.',
  'Boarding Management':'Boarding reservations, occupancy, drop-off and pickup details.',
  'Health Records':'Veterinary information, vaccinations and medical documentation.',
  'Grooming Records':'Grooming services, visits and treatment records.',
  'Nutrition & Supplements':'Feeding plans, supplements and dietary instructions.',
  'Daily Operations':'Shift categories, duty assignments and completion records.',
  Scheduling:'Events, scheduled tasks and operational reminders.',
  'Dog Training Management':'Client dogs, training schedules, session packages and progress reports.',
  'Maintenance Management':'Repairs, equipment conditions and maintenance history.',
  'Equipment & Inventory':'Facility assets, inventory locations and stock details.',
  'Financial Records':'Business expenses, payment entries and transaction records.',
  'Contracts & Agreements':'Saved contracts and associated business documents.',
  'Documents & Media':'Photos, digital files and scanned paperwork.',
  'Smart Tag Management':'QR and NFC assignments, placements and scan records.',
  'Travel & Reporting':'Travel manifests, reports and pedigree documentation.',
  'Staff Management':'Team activities, time entries and internal work records.',
  'Employee Management':'Team members, authorized access and invitations.'
};
const referenceTypes={clientID:['clients'],puppyID:['puppies'],litterID:['litters'],linkedLitterID:['litters'],linkedDogID:['dogs'],linkedPuppyID:['puppies'],dogID:['dogs'],kennelID:['kennels'],areaID:['kennels','inventoryLocations'],vehicleAreaID:['inventoryLocations'],placementID:['smartPlacements'],clientID:['clients'],templateID:['dailyDutyTemplates'],folderID:['scanFolders'],tagID:['smartTags'],containerTagID:['smartTags'],tripID:['travelManifests'],itemID:['inventoryItems']};
let teamMembers=[];
let rows=new Map(),identity=null,kennels=[],kennel='',role='',active='Overview',loading=false,loadSequence=0,editor=null,saving=false;
let month=new Date(new Date().getFullYear(),new Date().getMonth(),1),selectedDay='';
let stopScanner=null;
const employees=createEmployees({host:$('employeesPanel'),api,state:()=>({rows,identity,kennel,role}),onMembers:value=>{teamMembers=value},onError:e=>{message(e.message);if(e.status===401)requireLogin()},refresh:()=>load(),edit:row=>openEditor(row),add:type=>openEditor(null,type)});
const workflows=createWorkflows({state:()=>({rows,identity,kennel,role}),save:write,refresh:async cloud=>cloud?load(true):renderList(),edit:openEditor,add:(type,record)=>openEditor(null,type,record),choose:chooseCollection,onError:e=>{message(e.message);if(e.status===401)requireLogin()},onMessage:text=>message(text),complete:completeActivity,report:showReport,showPedigree});
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,action,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',action);return n};
const human=key=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/ID(s)?$/,' reference$1').replace(/^./,x=>x.toUpperCase());
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const message=(text='')=>$('error').textContent=text;
const localDay=date=>{const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function setConnection(text){$('connection').textContent=text}
async function api(path,options={}) {
  const r=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',...options});
  const data=await r.json().catch(()=>({error:'Unexpected cloud response'}));
  if(!r.ok)throw Object.assign(Error(data.error||'Cloud unavailable'),{status:r.status});
  return data;
}
async function init(){
  try{
    const value=await api('me');
    if(identity?.id!==value.user.id||editor&&!value.kennels?.some(k=>k.id===editor.kennel)){rows.clear();teamMembers=[];employees.reset();closeEditor(true)}
    identity=value.user;kennels=value.kennels||[];
    $('kennel').replaceChildren(...kennels.map(k=>{const o=el('option',k.name);o.value=k.id;return o}));
    if(!kennels.some(k=>k.id===kennel))kennel=kennels[0]?.id||'';
    $('kennel').value=kennel;
    $('login').hidden=true;$('workspace').hidden=false;
    if(!kennel){role='';rows.clear();message('This account has no active kennel. Ask your owner for a Business invitation.');render();return}
    await load();
  }catch(e){$('login').hidden=false;$('workspace').hidden=true;setConnection('Sign in to connect');if(e.status!==401)message(e.message)}
}
async function load(silent=false){
  if(!kennel||invitationMode)return;
  const sequence=++loadSequence,scope=kennel;loading=true;$('refresh').disabled=true;
  if(!silent)setConnection('Syncing cloud records…');
  try{
    const me=await api('me');if(sequence!==loadSequence)return;
    const membership=me.kennels?.find(k=>k.id===scope);
    if(!membership||me.user.id!==identity.id){rows.clear();closeEditor(true);throw Object.assign(Error('Your kennel access changed. Sign in again.'),{status:401})}
    role=membership.role;kennels=me.kennels;
    const next=new Map(),seen=new Set();let cursor=null;
    do{
      const data=await api('records?kennel='+encodeURIComponent(scope)+(cursor?'&cursor='+encodeURIComponent(cursor):''));
      if(sequence!==loadSequence)return;
      if(!Array.isArray(data.records))throw Error('Invalid cloud record list');
      for(const raw of data.records){const row=normalizedRow(raw);if(!uuid(row.id)||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('Invalid cloud record');if(!next.has(row.id)||next.get(row.id).revision<row.revision)next.set(row.id,row)}
      cursor=data.nextCursor||null;if(cursor&&seen.has(cursor))throw Error('Cloud paging repeated. Try refresh again.');if(cursor)seen.add(cursor);
    }while(cursor);
    const team=['owner','admin'].includes(role)?await api(`kennels/${scope}/members`):{members:[]};
    if(sequence!==loadSequence)return;
    teamMembers=team.members;
    rows=next;$('kennelName').textContent=membership.name;$('identity').textContent=`${identity.name||identity.email} · ${human(role)}`;
    setConnection('Synced '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
    if(!silent)message();render(silent);
    if(editor&&!saving){const latest=rows.get(editor.id);if(latest&&latest.revision!==editor.revision)showConflict(latest)}
  }catch(e){if(sequence===loadSequence){setConnection(e.status===401?'Sign in again':'Connection interrupted');if(!silent||e.status===401)message(e.message);if(e.status===401)requireLogin()}}
  finally{if(sequence===loadSequence){loading=false;$('refresh').disabled=false}}
}
function visibleGroups(){return Object.entries(groups).filter(([name,types])=>name==='Overview'||name==='Employee Management'&&!!role||types.some(t=>canRead(role,t)))}
function selectSection(name){if(name!=='Smart Tag Management'){stopScanner?.();stopScanner=null}active=name;selectedDay='';renderNav();renderPanel()}
function chooseCollection(type){const group=Object.entries(groups).find(([,types])=>types.includes(type));if(!group||!canRead(role,type))return;active=group[0];renderNav();renderPanel();$('collection').value=type;renderList()}
function renderNav(){
  const menu=$('nav');menu.replaceChildren();
  if(!visibleGroups().some(([name])=>name===active))active='Overview';
  menu.append(el('div','MANAGEMENT SECTIONS','nav-heading'));
  for(const [name] of visibleGroups()){
    const b=button(name,()=>selectSection(name),'');
    b.classList.toggle('active',name===active);
    b.setAttribute('aria-current',name===active?'page':'false');
    b.setAttribute('title',moduleDescriptions[name]||'Operations overview');
    menu.append(b);
  }
}
function render(background=false){renderNav();renderOverview();renderPanel(background)}
function renderOverview(){
  const box=$('overview');box.replaceChildren();
  const intro=el('section',undefined,'intro corporate-intro');
  const introContent=el('div',undefined,'intro-content');
  introContent.append(
    el('p','KENNEL MANAGEMENT PLATFORM','eyebrow'),
    el('h2','Centralized Kennel Operations'),
    el('p','Manage records, staff activity, and day-to-day kennel operations from one secure business dashboard. Keep your organization aligned across devices with shared access to essential information.')
  );
  intro.append(introContent);
  box.append(intro);
  const sectionHeader=el('div',undefined,'module-section-header');
  const headingGroup=el('div');
  headingGroup.append(el('p','WORKSPACE DIRECTORY','eyebrow'),el('h2','Management Sections'));
  sectionHeader.append(headingGroup,el('p','Select a department to view its authorized records and operational tools.','muted'));
  box.append(sectionHeader);
  const grid=el('div',undefined,'metrics');
  let index=0;
  for(const [name,types] of visibleGroups().filter(([name])=>name!=='Overview')){
    const isEmployees=name==='Employee Management';
    const count=isEmployees?(['owner','admin'].includes(role)?teamMembers.length:null):[...rows.values()].filter(r=>types.includes(r.type)&&!r.deleted_at).length;
    const card=button('',()=>selectSection(name),'metric');
    card.setAttribute('aria-label',name+(count===null?'':', '+count+' records')+', open section');
    const upper=el('div',undefined,'metric-upper');
    upper.append(el('span',String(++index).padStart(2,'0'),'metric-index'),el('span','OPEN SECTION ↗','metric-open'));
    card.append(upper,el('h3',name),el('p',moduleDescriptions[name]||'Authorized business records.','metric-description'));
    const foot=el('div',undefined,'metric-footer');
    foot.append(el('strong',count===null?'—':String(count),'metric-number'),el('span',isEmployees?'Team members':'Active records'));
    card.append(foot);grid.append(card);
  }
  box.append(grid);
  if(!rows.size)box.append(el('p','No shared records are loaded yet. Connect your existing Business account in the Kennel One app and sync, or add a record here.','card overview-empty'));
}
function renderPanel(background=false){
  const overview=active==='Overview',staff=active==='Employee Management';$('overview').hidden=!overview;$('recordsPanel').hidden=overview||staff;$('employeesPanel').hidden=!staff;if(staff){employees.render(background);return}if(overview)return;
  const selection=$('collection').value,types=groups[active].filter(t=>canRead(role,t));
  $('collection').replaceChildren(...types.map(t=>{const o=el('option',labels[t]);o.value=t;return o}));
  if(types.includes(selection))$('collection').value=selection;
  $('sectionTitle').textContent=active;$('sectionSubtitle').textContent='SHARED KENNEL RECORDS';renderList();
}
function chosen(){return $('collection').value}
function renderList(){
  const type=chosen(),term=$('search').value.trim().toLowerCase(),deleted=$('deleted').checked;
  $('add').hidden=!canWrite(role,type);$('add').textContent='Add '+(labels[type]||'record').toLowerCase();

  let list=[...rows.values()].filter(r=>r.type===type&&(deleted?!!r.deleted_at:!r.deleted_at)&&(!term||JSON.stringify(r.record).toLowerCase().includes(term)));
  const category=window.__kennelClientCategory||'All clients';
  if(type==='clients'&&category!=='All clients'){
    list=list.filter(r=>(r.record?.services||'').split(',').map(x=>x.trim()).includes(category));
  }
  renderClientPanel(type);
  renderTrainingPanel(type);
  if(type==='training'&&window.__kennelTrainingClient)list=list.filter(r=>String(r.record.clientID||'').toLowerCase()===window.__kennelTrainingClient.toLowerCase());
  renderCalendar(type,list);
  renderSpecialized(type,list);
  if(type==='calendarEvents'&&!deleted){ $('list').replaceChildren();$('count').textContent=selectedDay?'Schedule for '+selectedDay:'Choose a date';return }
  if(type==='calendarEvents'&&selectedDay)list=list.filter(r=>localDay(r.record?.startDate)===selectedDay);
  list.sort((a,b)=>compareDisplayRecords(a,b,type));
  $('count').textContent=`${list.length} ${deleted?'deleted ':''}record${list.length===1?'':'s'}${selectedDay?' · '+selectedDay:''}`;
  $('list').replaceChildren();
  for(const row of list){
    const card=el('article',undefined,'record'+(row.deleted_at?' deleted':'')),head=el('div',undefined,'record-head'),text=el('div'),actions=el('div',undefined,'actions');
    text.append(el('h3',recordName(row.record)),el('p',[row.record?.status,row.record?.category,row.record?.date||row.record?.startDate?new Date(row.record.date||row.record.startDate).toLocaleDateString():null].filter(Boolean).join(' · '),'muted'));
    if(canWrite(role,type)&&row.record){actions.append(button(row.deleted_at?'Restore':'Edit',()=>row.deleted_at?restore(row):openEditor(row)));if(!row.deleted_at)actions.append(button('Delete',()=>remove(row),'danger'))}
    if(!row.deleted_at&&['documents','scannedReports'].includes(type)&&['owner','admin'].includes(role)){actions.append(button('Download',()=>download(row)));actions.append(button('Replace file',()=>replaceFile(row)));}
    if(!row.deleted_at&&type==='tasks'&&canWrite(role,type))actions.append(button(row.record.completed?'Reopen':'Complete',()=>toggleCompleted(row)));
    if(!row.deleted_at){actions.append(button(type==='payments'?'Receipt':'Print record',()=>showReport(type==='payments'?'Payment receipt':recordName(row.record),[[labels[type],[row.record]]])));if(type==='dogs')workflows.dogActions(row,actions);if(type==='smartTags')actions.append(button('View / print QR',()=>showTagQR(row)));if(['clients','training','boardingRecords'].includes(type))actions.append(button('Share',()=>shareRecord(row)));
      if(type==='training'&&canWrite(role,'calendarEvents'))actions.append(button('Schedule session',()=>scheduleTraining(row)));
      if(canWrite(role,'documents')&&!['documents','scannedReports'].includes(type))actions.append(button('Attach photo / document',()=>attachDocument(row)))}
    head.append(text,actions);card.append(head);
    const detail=el('details',undefined,'detail-block');detail.append(el('summary','View record details'));const dl=el('dl');
    for(const [key,value] of Object.entries(row.record||{})){if(key==='id'||value==null||value==='')continue;dl.append(el('dt',human(key)),el('dd',displayValue(value,key)))}detail.append(dl);card.append(detail);
    if(row.record?.notes)card.append(el('p',row.record.notes,'muted'));
    $('list').append(card);
  }
  if(!list.length)$('list').append(el('p',deleted?'No deleted records.':'No records match this view.','empty'));
}

function renderSpecialized(type,list){
  const host=$('specialized')||(()=>{const elHost=el('div');elHost.id='specialized';$('calendar').insertAdjacentElement('afterend',elHost);return elHost})();
  if(type==='smartTags'&&host.dataset.activeType===type&&host.querySelector('[data-scanning="true"]'))return;
  stopScanner?.();stopScanner=null;
  // Reuse the live payment form across cloud polling; rebuilding it cleared typed values every 15 seconds.
  if(type==='payments'&&host.dataset.activeType==='payments'&&host.querySelector('form')){
    const active=list.filter(r=>!r.deleted_at);
    const realPayments=active.filter(r=>!String(r.record?.method||'').includes('Sandbox'));
    const testPayments=active.filter(r=>String(r.record?.method||'').includes('Sandbox'));
    const summary=host.querySelector('[data-payment-summary]');
    if(summary)summary.textContent=realPayments.length+' real payment records · Recorded total: '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(realPayments.reduce((n,r)=>n+(Number(r.record?.amount)||0),0))+' · '+testPayments.length+' sandbox test records (excluded from revenue)';
    return;
  }
  host.dataset.activeType=type;
  host.replaceChildren();
  if($('deleted').checked)return;
  if(type==='dailyDutyRecords'){
    workflows.duties(host);
  }
  if(type==='kennelCareSessions')workflows.care(host);
  workflows.summary(host,type);
  if(type==='payments'){
    const live=list.filter(r=>!r.deleted_at),realPayments=live.filter(r=>!String(r.record?.method||'').includes('Sandbox')),testPayments=live.filter(r=>String(r.record?.method||'').includes('Sandbox')),amount=(records,key)=>records.reduce((total,r)=>total+(Number(r.record?.[key])||0),0);
    const panel=el('section',undefined,'specialized-panel');
    panel.append(el('h3','Payment ledger'),el('p','These are saved payment records, not live Square transactions. To charge a card, use the authorized payment flow in the app.','muted'));
    const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);const paymentSummary=el('p',realPayments.length+' real payment records · Recorded total: '+money(amount(realPayments,'amount'))+' · '+testPayments.length+' sandbox test records (excluded from revenue)','muted');paymentSummary.dataset.paymentSummary='true';panel.append(paymentSummary);
    if(['owner','admin'].includes(role)){
      // Browser-local pending list. Pending requests must never be written to the paid ledger.
      const pendingKey='kennelflow.pendingSquare.'+kennel;
      const readPending=()=>{try{const records=JSON.parse(localStorage.getItem(pendingKey)||'[]');return Array.isArray(records)?records.filter(x=>x&&typeof x.orderID==='string').slice(0,100):[]}catch{return []}};
      const writePending=records=>{try{localStorage.setItem(pendingKey,JSON.stringify(records.slice(0,100)))}catch{}};
      const pendingPanel=el('section',undefined,'specialized-panel');
      const pendingHeading=el('h3','Pending Square checkouts (this browser only)');
      const pendingHelp=el('p','Unpaid requests are not revenue. These requests stay on this browser; syncing them to iPhone requires cloud support.','muted');
      const pendingItems=el('div');
      const drawPending=()=>{
        pendingItems.replaceChildren();
        const records=readPending();
        if(!records.length){pendingItems.append(el('p','No pending checkouts saved on this browser.','muted'));return}
        for(const entry of records){
          const box=el('div',undefined,'record-card');
          box.append(el('strong',entry.customerName+' — '+money(entry.amountCents/100)),el('p','Reference: '+(entry.reference||'none')+' · Created '+new Date(entry.createdAt).toLocaleString()));
          const link=el('a','Open Square checkout');link.href=entry.url;link.target='_self';link.rel='noopener noreferrer';box.append(link);
          const status=el('p','Pending — no payment recorded');
          const verify=button('Check payment',async()=>{
            verify.disabled=true;status.textContent='Checking Square…';
            try{
              const result=await api('kennels/'+kennel+'/square-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderID:entry.orderID,amountCents:entry.amountCents,customerName:entry.customerName})});
              if(result.saved||result.alreadyRecorded){writePending(readPending().filter(x=>x.orderID!==entry.orderID));status.textContent='Paid and recorded. Refreshing…';await load(true)}
              else status.textContent='Still unpaid: '+(result.status||'unknown');
            }catch(error){status.textContent='Status check failed: '+error.message}
            finally{verify.disabled=false}
          });
          const remove=button('Remove from this browser',()=>{writePending(readPending().filter(x=>x.orderID!==entry.orderID));drawPending()});
          box.append(verify,remove,status);pendingItems.append(box);
        }
      };
      pendingPanel.append(pendingHeading,pendingHelp,pendingItems);panel.append(pendingPanel);drawPending();
      const cloudHeading=el('h3','Cloud Square checkout history');
      const cloudList=el('div');pendingPanel.append(cloudHeading,cloudList);
      void (async()=>{
        try{
          const cloud=await api('kennels/'+kennel+'/square-pending');
          const entries=cloud.checkouts||[];
          cloudList.replaceChildren();
          if(!entries.length){cloudList.append(el('p','No cloud checkouts have been created yet.','muted'));return}
          for(const entry of entries){
            const row=el('div',undefined,'record-card');
            row.append(el('p',entry.customer_name+' — '+money(entry.amount_cents/100)+' — '+entry.status+' — '+(entry.reference||'no reference')));
            if(entry.checkout_url&&entry.status==='PENDING'){
              const link=el('a','Open checkout');link.href=entry.checkout_url;link.target='_self';link.rel='noopener noreferrer';row.append(link);
              const message=el('p','');
              const check=button('Check cloud payment',async()=>{
                check.disabled=true;message.textContent='Checking Square…';
                try{
                  const r=await api('kennels/'+kennel+'/square-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderID:entry.order_id,amountCents:entry.amount_cents,customerName:entry.customer_name})});
                  message.textContent=r.paid?'Square confirms payment. Refresh to update records.':'Still unpaid: '+(r.status||'pending');
                  if(r.saved)await load(true);
                }catch(e){message.textContent='Could not check: '+e.message}finally{check.disabled=false}
              });row.append(check,message);
            }
            cloudList.append(row);
          }
        }catch(error){cloudList.textContent='Cloud checkout history unavailable: '+error.message}
      })();
      // Reconcile previously created requests when the owner opens Payments.
      // Only server-verified completed transactions are saved as revenue.
      const pendingNow=readPending().slice(0,8);
      if(pendingNow.length){
        const syncLabel=el('p','Checking saved pending requests with Square…','muted');
        pendingPanel.append(syncLabel);
        void (async()=>{
          let completed=0,failed=0;
          for(const entry of pendingNow){
            try{
              const result=await api('kennels/'+kennel+'/square-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderID:entry.orderID,amountCents:entry.amountCents,customerName:entry.customerName})});
              if(result.saved||result.alreadyRecorded){
                writePending(readPending().filter(x=>x.orderID!==entry.orderID));
                completed++;
              }
            }catch{failed++}
          }
          syncLabel.textContent=completed?completed+' completed Square payment(s) reconciled. Refresh to see ledger updates.':failed?failed+' request(s) could not be checked; use Check payment to retry.':'Pending requests checked; no new completed payments.';
          drawPending();
        })();
      }
      const form=el('form',undefined,'employee-form');
      const customer=el('input'),sum=el('input'),detail=el('input'),reference=el('input'),submit=el('button','LIVE Square checkout — real payments'),feedback=el('p');
      customer.placeholder='Customer name';customer.required=true;sum.type='number';sum.step='0.01';sum.min='1';sum.placeholder='Amount (USD)';sum.required=true;
      detail.placeholder='Payment description';reference.placeholder='Invoice reference (optional)';
      for(const [title,input] of [['Customer',customer],['Amount USD',sum],['Description',detail],['Reference',reference]]){const label=el('label',title);label.append(input);form.append(label)}
      form.append(submit);form.addEventListener('submit',async event=>{
        event.preventDefault();const amountCents=Math.round(Number(sum.value)*100);
        if(!Number.isSafeInteger(amountCents)||amountCents<100){feedback.textContent='Enter a valid amount.';return}
        submit.disabled=true;feedback.textContent='Requesting checkout securely…';
        try{const data=await api('kennels/'+kennel+'/square-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountCents,customerName:customer.value,description:detail.value,reference:reference.value})});
          feedback.replaceChildren(el('span','Checkout link created. Payment is not yet confirmed. Share this link with the customer: '));
          const anchor=el('a','Open Square checkout');anchor.href=data.url;anchor.target='_self';anchor.rel='noopener noreferrer';feedback.append(anchor);
          writePending([{orderID:data.orderID,url:data.url,amountCents,customerName:customer.value.trim(),reference:reference.value.trim(),createdAt:new Date().toISOString()},...readPending().filter(x=>x.orderID!==data.orderID)]);drawPending();
          const liveStatus=el('p','Payment not yet verified.');
          liveStatus.setAttribute('role','status');liveStatus.setAttribute('aria-live','polite');
          const liveVerify=button('Verify live Square payment',async()=>{
            if(liveVerify.disabled)return;
            liveVerify.disabled=true;liveVerify.textContent='Checking Square…';
            liveStatus.textContent='Checking payment status securely…';
            const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
            try{
              const verified=await api('kennels/'+kennel+'/square-status',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({orderID:data.orderID,amountCents,customerName:customer.value})});
              liveStatus.textContent=verified.paid?(verified.saved?'Payment confirmed and saved in Kennel One.':verified.alreadyRecorded?'Payment previously recorded.':'Square confirmed payment; Kennel One save not confirmed.'):'No completed payment yet. Status: '+(verified.status||'unknown');
              if(verified.saved)await load(true);
            }catch(error){liveStatus.textContent=error.name==='AbortError'?'Payment verification timed out. Retry in a moment.':'Payment verification failed: '+error.message}
            finally{clearTimeout(timer);liveVerify.disabled=false;liveVerify.textContent='Verify live Square payment'}
          });
          feedback.append(liveVerify,liveStatus);
        }catch(e){feedback.textContent='LIVE Square payments error: '+e.message+'. This is separate from sandbox testing.'}finally{submit.disabled=false}
      });
      const recoveryMessage=el('p','Use the original Square reference to recover an already-paid checkout. No new charge will be created.');
      recoveryMessage.setAttribute('role','status');
      recoveryMessage.setAttribute('aria-live','polite');
      const recover=button('Find completed Square payment by reference',async()=>{
        const amountCents=Math.round(Number(sum.value)*100);
        const lookup=reference.value.trim();
        if(!customer.value.trim()||!lookup||!Number.isSafeInteger(amountCents)||amountCents<100){
          recoveryMessage.textContent='Enter the original customer, payment amount, and invoice reference first.';return;
        }
        recover.disabled=true;
        recoveryMessage.textContent='Searching Square for a completed payment. No charge is being made…';
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
        try{
          const result=await api('kennels/'+kennel+'/square-recover',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({reference:lookup,amountCents,customerName:customer.value.trim()})});
          recoveryMessage.textContent=result.saved?'Square payment found and saved to the Kennel One ledger.':result.alreadyRecorded?'The payment was already recorded.':'Square confirmed a matching payment, but ledger storage needs review.';
          if(result.saved)await load(true);
        }catch(error){recoveryMessage.textContent=error.name==='AbortError'?'Square recovery timed out. No new charge was made.':'Could not recover payment: '+error.message}
        finally{clearTimeout(timeout);recover.disabled=false}
      });
      form.append(recover,recoveryMessage);
      const sandboxButton=button('Create sandbox test checkout',async()=>{
        const amountCents=Math.round(Number(sum.value)*100);
        if(!customer.value.trim()||!Number.isSafeInteger(amountCents)||amountCents<100){feedback.textContent='Enter customer name and test amount first.';return}
        sandboxButton.disabled=true;
        try{const data=await api('kennels/'+kennel+'/square-sandbox-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountCents,customerName:customer.value,description:detail.value,reference:reference.value})});
          feedback.replaceChildren(el('strong','SANDBOX ONLY — no real money. '));
          const link=el('a','Open test checkout');link.href=data.url;link.target='_self';link.rel='noopener noreferrer';feedback.append(link);
          feedback.append(el('span',' (opens in this browser) '));
          const copyLink=button('Copy test checkout link',async()=>{
            try{
              if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(data.url);message('Test checkout link copied. Paste it into Safari if this browser does not open the link.');}
              else{message('To open in Safari, press and hold the checkout link, then choose Copy Link.');}
            }catch{message('Press and hold the checkout link, choose Copy Link, and paste it into Safari.');}
          });
          feedback.append(copyLink);
          const verifyResult=el('p','No payment verification has been run yet.');
          verifyResult.setAttribute('role','status');
          verifyResult.setAttribute('aria-live','polite');
          const check=button('Verify Square test payment',async()=>{
            if(check.disabled)return;
            check.disabled=true;
            check.textContent='Checking Square…';
            verifyResult.textContent='Contacting Square for this checkout. Please wait (up to 25 seconds)…';
            const controller=new AbortController();
            const timeout=setTimeout(()=>controller.abort(),25000);
            try{
              const v=await api('kennels/'+kennel+'/square-sandbox-status',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({orderID:data.orderID,amountCents,customerName:customer.value})});
              verifyResult.textContent=v.paid?(v.saved?'Square confirmed payment and saved the TEST record in Kennel One.':v.alreadyRecorded?'Square confirmed payment; record already exists.':'Square confirmed payment, but saving the record is not confirmed.'):'No completed Square sandbox payment was found. Status: '+(v.status||'unknown');
              if(v.saved)await load(true);
            }catch(e){verifyResult.textContent=e.name==='AbortError'?'Verification timed out. Square or cloud is taking too long; please retry.':'Verification failed: '+e.message}
            finally{clearTimeout(timeout);check.textContent='Verify Square test payment';check.disabled=false}
          });feedback.append(check,verifyResult);
        }catch(e){feedback.textContent=e.message}finally{sandboxButton.disabled=false}
      },'secondary');
      panel.append(el('h3','Request payment with Square'),el('p','LIVE checkout charges real payment methods. SANDBOX checkout is for testing only.'),form,sandboxButton,feedback);
    }
    host.append(panel);
  }
  if(type==='kennels'||type==='equipment'){
    const panel=el('section',undefined,'specialized-panel');
    const needs=list.filter(r=>!r.deleted_at&&(type==='kennels'?r.record?.needsMaintenance:r.record?.needsReplacement||['Broken','Needs Repair','Poor'].includes(r.record?.condition)));
    panel.append(el('h3','Maintenance attention'),el('p',needs.length+' '+(type==='kennels'?'kennel areas':'equipment items')+' flagged for attention. These flags sync as existing native app records. Detailed maintenance logs need a matching cloud model.','muted'));
    for(const row of needs){const line=el('div',undefined,'specialized-line');line.append(el('strong',recordName(row.record)),button('Review',()=>openEditor(row)));panel.append(line)}
    const historyArea=el('div');panel.append(button('Load kennel/equipment change history',async()=>{
      historyArea.replaceChildren(el('p','Loading saved change history…','muted'));
      try{
        const response=await api('kennels/'+kennel+'/history');
        const changes=(response.events||[]).filter(e=>['kennels','equipment'].includes(e.record_type)||['KennelRun','EquipmentItem'].includes(e.record_type));
        historyArea.replaceChildren();
        for(const event of changes){const item=el('div',undefined,'specialized-line');item.append(el('span',(event.title||'Kennel item')+' · '+(event.action||'Changed')+' · '+(event.actor_name||'Team member')+' · '+new Date(event.created_at).toLocaleString()));historyArea.append(item)}
        if(response.nextCursor)historyArea.append(el('p','Showing the most recent change-history page. Older history is available in Employees → Work history.','muted'));
        if(!changes.length)historyArea.append(el('p','No recent kennel or equipment edits in the current history page.','muted'));
      }catch(e){historyArea.replaceChildren(el('p',e.message,'muted'))}
    }));panel.append(historyArea);
    host.append(panel);
  }
  if(type==='smartTags'){
    const panel=el('section',undefined,'specialized-panel');panel.append(el('h3','QR / NFC assignments'),el('p','Scan a QR code, choose a code photo, or paste a saved tag. NFC needs a device and browser that support Web NFC.','muted'));
    const field=el('label','Tag or QR payload'),input=el('input');input.type='search';input.placeholder='Paste a scanned QR code or tag ID';field.append(input);
    const result=el('div');input.addEventListener('input',()=>{
      const value=input.value.trim().toLowerCase();result.replaceChildren();
      if(!value)return;
      const tagID=value.match(/^kennelflow:\/\/smart\/([a-f0-9-]{36})$/)?.[1];
      const matches=[...rows.values()].filter(r=>r.type==='smartTags'&&!r.deleted_at&&(r.id.toLowerCase()===tagID||tagPayload(r.record).toLowerCase()===value||Object.values(r.record||{}).some(v=>typeof v==='string'&&v.toLowerCase().includes(value))));
      for(const row of matches.slice(0,10)){const match=el('div',undefined,'specialized-line');match.append(el('strong',recordName(row.record)),button('View / print QR',()=>showTagQR(row)));if(canWrite(role,type))match.append(button('Edit assignment',()=>openEditor(row)));const linked=[row.record.dogID,row.record.areaID,row.record.linkedID].map(id=>id&&rows.get(id.toLowerCase())).find(r=>r&&!r.deleted_at);if(linked&&canRead(role,linked.type))match.append(button('Open linked record',()=>{chooseCollection(linked.type);if(canWrite(role,linked.type))openEditor(linked)}));result.append(match)}
      if(!matches.length)result.append(el('p','No matching saved assignments.','muted'));
    });
    panel.append(field,result);
    const scanner=el('div');panel.append(scanner);stopScanner=attachScanner(scanner,value=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))});
    const writer=button('Program NFC tag',async()=>{
      if(!('NDEFReader' in window)){message('This browser does not support Web NFC writing. Use supported Chrome on Android or the Kennel One iPhone app.');return}
      const value=input.value.trim();
      const match=[...rows.values()].find(r=>r.type==='smartTags'&&!r.deleted_at&&(r.id===value.toLowerCase()||tagPayload(r.record).toLowerCase()===value.toLowerCase()||r.record?.name===value));
      if(!match){message('Enter the exact tag name, record ID or QR payload for an existing assignment before programming.');return}
      const payload=tagPayload(match.record);
      if(!confirm('Write this Kennel One assignment onto the NFC tag you hold to this device? This will overwrite its current NDEF contents.'))return;
      writer.disabled=true;
      try{const ndef=new window.NDEFReader();await ndef.write({records:[{recordType:'text',data:payload}]});message('NFC write completed for '+recordName(match.record)+'. Scan the tag in the Kennel One app to confirm its linked record.')}
      catch(e){message('NFC writing was not completed: '+(e?.message||'Device or tag not available'))}
      finally{writer.disabled=false}
    });
    if(canWrite(role,type))panel.append(writer);panel.append(el('p','On iPhone, use the native Kennel One app to program NFC. QR scanning and QR labels are available here.','muted'));host.append(panel);
  }
}


function clientRows(){
  return [...rows.values()].filter(r=>r.type==='clients'&&!r.deleted_at);
}
function renderClientPanel(type){
  const panel=$('clientTools');panel.replaceChildren();panel.hidden=type!=='clients';
  if(type!=='clients')return;
  const head=el('div',undefined,'directory-intro');
  head.append(el('h3','Client Directory'),el('p','Manage each client’s contact information, pets, medical instructions and enrolled services.','muted'));
  panel.append(head);
  const toolbar=el('div',undefined,'directory-toolbar');
  const label=el('label','Filter by service');
  const filter=el('select');filter.id='clientServiceFilter';
  const current=window.__kennelClientCategory||'All clients';
  for(const option of ['All clients','Boarding','Grooming','Training']){
    const entry=el('option',option);entry.value=option;filter.append(entry);
  }
  filter.value=current;
  filter.addEventListener('change',()=>{window.__kennelClientCategory=filter.value;renderList()});
  label.append(filter);toolbar.append(label);
  if(canWrite(role,'clients'))toolbar.append(button('Add client',()=>{
    const value=newRecord('ClientRecord');
    if(current!=='All clients')value.services=current;
    openEditor(null,'clients',value)
  }));
  toolbar.append(button('Print client directory',()=>{
    const all=clientRows().filter(r=>current==='All clients'||(r.record.services||'').split(',').map(s=>s.trim()).includes(current));
    showReport('Client Directory', [['Client Profiles',all.map(r=>r.record)]]);
  },'secondary'));
  panel.append(toolbar);
  const totals=el('div',undefined,'directory-totals');
  for(const category of ['All clients','Boarding','Grooming','Training']){
    const n=clientRows().filter(r=>category==='All clients'||(r.record.services||'').split(',').map(s=>s.trim()).includes(category)).length;
    totals.append(el('span',category+': '+n,'directory-stat'));
  }
  panel.append(totals);
}
function renderTrainingPanel(type){
  const panel=$('trainingTools');panel.replaceChildren();panel.hidden=type!=='training';
  if(type!=='training')return;
  const head=el('div',undefined,'directory-intro');
  head.append(el('h3','Client Dog Training'),el('p','Track clients, dogs, trainers, booked sessions, packages, goals and progress in one training workspace.','muted'));
  panel.append(head);
  const toolbar=el('div',undefined,'directory-toolbar');
  const clientLabel=el('label','Training client');
  const pick=el('select');pick.id='trainingClientFilter';
  let opt=el('option','All training clients');opt.value='';pick.append(opt);
  for(const client of clientRows()){
    opt=el('option',client.record.name);opt.value=client.id;pick.append(opt)
  }
  pick.value=window.__kennelTrainingClient||'';
  pick.addEventListener('change',()=>{window.__kennelTrainingClient=pick.value;renderList()});
  clientLabel.append(pick);toolbar.append(clientLabel);
  if(canWrite(role,'training'))toolbar.append(button('Add training record',()=>openEditor(null,'training')));
  if(canWrite(role,'calendarEvents'))toolbar.append(button('Book training session',()=>scheduleTraining()));
  panel.append(toolbar);
  const records=[...rows.values()].filter(r=>r.type==='training'&&!r.deleted_at);
  const packages=new Map();
  for(const row of records){
    const key=(row.record?.packageName||'').trim();if(!key)continue;
    const value=packages.get(key)||{count:0,sessions:0};
    value.count++;value.sessions+=Number(row.record.packageSessions||0);packages.set(key,value);
  }
  if(packages.size){
    const box=el('div',undefined,'package-summary');
    box.append(el('h4','Training packages','package-heading'));
    const grid=el('div',undefined,'package-grid');
    for(const [name,stat] of packages)grid.append(el('div',name+' · '+stat.count+' record'+(stat.count===1?'':'s'),'directory-stat'));
    box.append(grid);panel.append(box);
  }
}
async function shareRecord(row){
  const display=Object.entries(row.record||{}).filter(([k,v])=>k!=='id'&&v!=null&&v!=='').map(([key,value])=>human(key)+': '+displayValue(value,key)).join('\n');
  const title='Kennel One · '+recordName(row.record);
  try{
    if(navigator.share)await navigator.share({title,text:title+'\n'+display});
    else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(title+'\n'+display);message('Record details copied for sharing.')}
    else showReport(title,[[labels[row.type],[row.record]]]);
  }catch(error){if(error?.name!=='AbortError')message('Sharing unavailable: '+error.message)}
}
function scheduleTraining(row){
  const draft=newRecord('KennelCalendarEvent');
  const record=row?.record||{};
  draft.title='Training · '+(record.dogName||'Client dog');
  draft.category='Training';
  draft.startDate=record.nextSession||record.date||isoDate(Date.now());
  draft.endDate=isoDate(new Date(Date.parse(draft.startDate)+Math.max(15,record.durationMinutes||60)*60000));
  draft.notes=[record.packageName&&'Package: '+record.packageName,record.trainerName&&'Trainer: '+record.trainerName,record.trainingGoals].filter(Boolean).join('\n');
  draft.linkedType='TrainingRecord';
  if(row)draft.linkedID=row.id;
  openEditor(null,'calendarEvents',draft);
}

function displayValue(value,key){if(typeof value==='boolean')return value?'Yes':'No';if(Array.isArray(value))return value.map(x=>typeof x==='object'?Object.entries(x).filter(([k])=>k!=='id').map(([k,v])=>human(k)+': '+displayValue(v,k)).join(' · '):String(x)).join('\n');if(typeof value==='object')return JSON.stringify(value);if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value))return new Date(value).toLocaleString();return String(value)}
function renderCalendar(type,list){
  const box=$('calendar');box.replaceChildren();if(type!=='calendarEvents'||$('deleted').checked)return;
  const bar=el('div',undefined,'calendar-bar');bar.append(button('Previous month',()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);selectedDay='';renderList()}),el('strong',month.toLocaleString([],{month:'long',year:'numeric'})),button('Next month',()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);selectedDay='';renderList()}));box.append(bar);
  workflows.calendar(box,month,selectedDay,key=>{selectedDay=key;renderList()});
  if(selectedDay)box.append(button('Show all dates',()=>{selectedDay='';renderList()}));
}
function closeEditor(force=false){if(!force&&editor?.dirty&&!confirm('Discard your unsaved changes?'))return false;$('editor').close();editor=null;$('upload').value='';return true}
function openEditor(row,typeOverride,initialRecord){
  const type=row?.type||typeOverride||chosen();if(!canWrite(role,type))return;
  const record=row?structuredClone(row.record):initialRecord?structuredClone(initialRecord):newRecord(collections[type]);
  if(!record){message('This record has an unsupported format. Its cloud copy was preserved.');return}
  if(!row&&type==='calendarEvents'&&selectedDay)record.startDate=isoDate(selectedDay+'T09:00:00');
  if(!row&&type==='dailyDutyRecords'){record.dateKey=dayKey();if(!record.shift)record.shift=[...rows.values()].find(r=>r.type==='dailyDutyShifts'&&!r.deleted_at)?.record.name||''}
  editor={id:(row?.id||record.id).toLowerCase(),type,revision:row?.revision||0,base:structuredClone(record),draft:record,dirty:!row,kennel,conflict:null};
  $('editorTitle').textContent=(row?'Edit ':'Add ')+(labels[type]||'record');$('editorSubtitle').textContent='CHANGES SYNC WITH YOUR APP';$('editError').textContent='';$('editStatus').textContent='';$('upload').value='';$('uploadLabel').hidden=!['documents','scannedReports'].includes(type)||!!row;$('conflict').hidden=true;$('save').disabled=false;
  $('fields').replaceChildren();renderObject(collections[type],editor.draft,$('fields'));
  $('cameraButton').hidden=!['documents','scannedReports'].includes(type)||!!row;
  $('deleteEditor').hidden=!row;
  $('deleteEditor').onclick=async()=>{await remove(row);if(rows.get(row.id)?.deleted_at)closeEditor(true)};
  $('editor').showModal();
}
function dirty(){if(editor){editor.dirty=true;$('editStatus').textContent='Unsaved changes'}}
function renderObject(model,object,parent){
  for(const field of models[model]||[]){
    if(field.key==='id'||(['documents','scannedReports'].includes(editor?.type)&&field.key==='fileName'))continue;
    const label=el('label',human(field.key)),value=object[field.key],type=field.type;
    if(type.startsWith('[')){parent.append(renderArray(field,object));continue}
    if(model==='ClientRecord'&&field.key==='services'){
      const wrap=el('fieldset',undefined,'wide service-selector'),legend=el('legend','Client services');
      wrap.append(legend,el('p','Select all services this client uses.','muted'));
      for(const category of ['Boarding','Grooming','Training']){
        const item=el('label',undefined,'check');
        const input=el('input');input.type='checkbox';input.checked=(object.services||'').split(',').map(x=>x.trim()).includes(category);
        input.addEventListener('change',()=>{const values=new Set((object.services||'').split(',').map(x=>x.trim()).filter(Boolean));input.checked?values.add(category):values.delete(category);object.services=[...values].join(', ');dirty()});
        item.append(input,document.createTextNode(category));wrap.append(item);
      }
      parent.append(wrap);continue;
    }
    let control;
    if(field.key==='assignedTo'&&teamMembers.length){
      control=el('select');const blank=el('option','Unassigned');blank.value='';control.append(blank);
      const names=[...new Set(teamMembers.map(m=>m.name||m.email))];if(value&&!names.includes(value))names.unshift(value);
      for(const name of names){const option=el('option',name);option.value=name;control.append(option)}control.value=value||'';
    }else if(field.key==='shift'&&['dailyDutyTemplates','dailyDutyRecords'].includes(editor?.type)){
      control=el('select');const names=[...new Set([...rows.values()].filter(r=>r.type==='dailyDutyShifts'&&!r.deleted_at).map(r=>r.record.name))];if(value&&!names.includes(value))names.unshift(value);for(const name of names){const o=el('option',name);o.value=name;control.append(o)}control.value=value||names[0]||'';object[field.key]=control.value;
    }else if(field.options||type==='Bool'&&field.optional||type==='UUID'){
      control=el('select');if(field.optional||type==='UUID'){const blank=el('option',field.optional?'None':'Choose a record');blank.value='';control.append(blank)}
      let options=field.options?.map(v=>[v,v])||[];
      if(type==='Bool')options=[['true','Yes'],['false','No']];
      if(type==='UUID'){
        options=[...rows.values()].filter(r=>!r.deleted_at&&r.id!==editor.id&&(!referenceTypes[field.key]||referenceTypes[field.key].includes(r.type))).map(r=>[r.id,recordName(r.record)+' · '+labels[r.type]]);
        if(field.key==='staffID')options=(teamMembers.length?teamMembers:[identity]).map(m=>[m.id,m.name||m.email]);
        if(value&&!options.some(([id])=>id.toLowerCase()===String(value).toLowerCase()))options.unshift([value,'Existing reference · '+value]);
      }
      for(const [v,text] of options){const option=el('option',text);option.value=v;control.append(option)}control.value=value==null?'':String(value);
    }else if(type==='Bool'){control=el('input');control.type='checkbox';control.checked=!!value;label.classList.add('check')}
    else if(type==='String'&&/notes|instructions|text|description|detail|body|plan|medications|allergies|homework|goals/i.test(field.key)){control=el('textarea');control.value=value||'';label.classList.add('wide')}
    else {control=el('input');control.type=type==='Date'?'datetime-local':['Double','Int','Int64'].includes(type)?'number':field.key.toLowerCase().includes('email')?'email':'text';if(type==='Date')control.step='1';if(control.type==='number')control.step=type==='Double'?'any':'1';control.value=value==null?'':type==='Date'?dateInput(value):String(value)}
    control.required=!field.optional&&type!=='Bool';control.dataset.field=field.key;
    const pickerOptions=field.key==='breed'?catalog.recognizedBreeds:field.key==='color'?breedColors(object.breed):field.key==='coat'?breedCoats(object.breed):field.key.toLowerCase().includes('registrationorganization')||field.key==='registry'?catalog.registries:field.key==='sex'?['Male','Female','Unknown']:null;
    if(pickerOptions&&control.tagName==='INPUT'){
      const choices=el('datalist');choices.id='choices-'+editor.id+'-'+model+'-'+field.key;for(const option of pickerOptions){const value=el('option');value.value=option;choices.append(value)}control.setAttribute('list',choices.id);label.append(choices);
      if(field.key==='breed')control.addEventListener('input',()=>{for(const [key,options] of [['color',breedColors(control.value)],['coat',breedCoats(control.value)]]){const list=parent.querySelector('[data-field="'+key+'"]')?.list;if(list){list.replaceChildren();for(const name of options){const option=el('option');option.value=name;list.append(option)}}}});
    }
    if(field.key==='dateKey')control.type='date';
    control.addEventListener('input',()=>{let next=type==='Bool'?(field.optional?control.value===''?undefined:control.value==='true':control.checked):control.value===''&&field.optional?undefined:type==='Date'?control.value?isoDate(control.value):'':['Double','Int','Int64'].includes(type)?Number(control.value):control.value;if(next===undefined)delete object[field.key];else object[field.key]=next;dirty()});
    label.append(control);parent.append(label);
  }
}
function dateInput(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const shifted=new Date(d.getTime()-d.getTimezoneOffset()*60000);return shifted.toISOString().slice(0,19)}
function renderArray(field,object){
  const box=el('fieldset',undefined,'wide');box.append(el('legend',human(field.key)));const list=el('div');box.append(list);
  const child=field.type.slice(1,-1);
  function render(){list.replaceChildren();for(const [i,value] of (object[field.key]||[]).entries()){
    const item=el('div',undefined,'array-item');if(models[child]){const fields=el('div',undefined,'fields');renderObject(child,value,fields);item.append(fields)}else{const label=el('label',human(field.key)+' '+(i+1)),input=el('input');input.value=value;input.required=true;input.addEventListener('input',()=>{object[field.key][i]=input.value;dirty()});label.append(input);item.append(label)}
    item.append(button('Remove item',()=>{object[field.key].splice(i,1);dirty();render()},'danger'));list.append(item);
  }}
  box.append(button('Add item',()=>{if(!object[field.key])object[field.key]=[];object[field.key].push(models[child]?newRecord(child):'');dirty();render()}));render();return box;
}
function showConflict(latest){
  if(!editor||editor.conflict?.revision===latest.revision)return;
  editor.conflict=latest;$('save').disabled=true;const box=$('conflict');box.hidden=false;box.replaceChildren();box.append(el('h3',latest.deleted_at?'This record was deleted on another device':'This record changed on another device'),el('p','Your unsaved form is preserved. Review the latest changes before saving.'));
  if(latest.deleted_at){box.append(button('Restore using my form',()=>{editor.revision=latest.revision;editor.base=structuredClone(latest.record);editor.conflict=null;box.hidden=true;$('save').disabled=false;dirty()}));return}
  const mine=editor.draft,base=editor.base,theirs=latest.record,merged=structuredClone(theirs),conflicts=[];
  for(const key of new Set([...Object.keys(base),...Object.keys(mine),...Object.keys(theirs)])){
    if(equal(mine[key],theirs[key])||equal(mine[key],base[key]))continue;
    if(equal(theirs[key],base[key])){if(Object.hasOwn(mine,key))merged[key]=structuredClone(mine[key]);else delete merged[key]}
    else conflicts.push(key);
  }
  const choices=new Map();
  for(const key of conflicts){const block=el('fieldset');block.append(el('legend',human(key)));for(const [choice,value] of [['mine',mine[key]],['cloud',theirs[key]]]){const label=el('label',undefined,'check'),radio=el('input');radio.type='radio';radio.name='conflict-'+key;radio.value=choice;radio.addEventListener('change',()=>choices.set(key,choice));label.append(radio,el('span',(choice==='mine'?'My form: ':'Latest cloud: ')+displayValue(value,key)));block.append(label)}box.append(block)}
  if(!conflicts.length)box.append(el('p','Your changes affect different fields. They can be combined with the latest cloud version.'));
  box.append(button('Apply reviewed changes',()=>{if(choices.size<conflicts.length){$('editError').textContent='Choose which version to keep for each conflicting field.';return}for(const key of conflicts){const source=choices.get(key)==='mine'?mine:theirs;if(Object.hasOwn(source,key))merged[key]=structuredClone(source[key]);else delete merged[key]}editor.draft=merged;editor.base=structuredClone(theirs);editor.revision=latest.revision;editor.conflict=null;$('fields').replaceChildren();renderObject(collections[editor.type],editor.draft,$('fields'));box.hidden=true;$('save').disabled=false;$('editError').textContent='';dirty()}));
}
async function write(row,record,deletedAt){if(row.kennel&&row.kennel!==kennel)throw Error('The selected kennel changed. Open this record again.');return api(`kennels/${kennel}/records/${row.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:row.type,expectedRevision:row.revision,record,...(deletedAt?{deletedAt}:{})})})}
async function save(event){
  event.preventDefault();if(!editor||saving||editor.conflict)return;
  const current=editor;if(current.kennel!==kennel)return;
  $('editError').textContent='';const upload=$('upload').files[0];
  if(['documents','scannedReports'].includes(current.type)&&current.revision===0){if(!upload){$('editError').textContent='Choose a photo or document first.';return}const ext=(upload.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').slice(0,12)||'bin';current.draft.fileName=current.id+'.'+ext}
  if(upload&&upload.size>10485760){$('editError').textContent='Choose a file smaller than 10 MB.';return}
  const error=validateModel(collections[current.type],current.draft);if(error){$('editError').textContent=human(error);return}
  if(current.type==='dailyDutyShifts'&&[...rows.values()].some(r=>r.type===current.type&&!r.deleted_at&&r.id!==current.id&&r.record.name.trim().toLowerCase()===current.draft.name.trim().toLowerCase())){$('editError').textContent='A duty category already has that name.';return}
  saving=true;$('save').disabled=true;$('closeEditor').disabled=true;$('cancelEditor').disabled=true;$('editStatus').textContent='Saving…';
  try{
    if(current.type==='dailyDutyShifts'&&current.revision>0&&current.base.name!==current.draft.name){
      for(const dependent of [...rows.values()].filter(r=>!r.deleted_at&&['dailyDutyTemplates','dailyDutyRecords'].includes(r.type)&&r.record.shift===current.base.name)){
        const response=await write(dependent,{...dependent.record,shift:current.draft.name});rows.set(dependent.id,normalizedRow(response.record));
      }
    }
    const data=await write(current,current.draft),row=normalizedRow(data.record);
    if(!uuid(row.id)||row.id.toLowerCase()!==current.id.toLowerCase()||row.revision<=current.revision)throw Error('Cloud acknowledgement was invalid. Refresh before retrying.');
    current.revision=row.revision;current.base=structuredClone(current.draft);rows.set(row.id,row);
    if(upload){const response=await fetch(`/api/kennels/${kennel}/files/${current.id}`,{method:'PUT',credentials:'same-origin',body:upload});if(!response.ok){const value=await response.json();throw Object.assign(Error('Record saved, but the file upload needs retrying: '+(value.error||'connection interrupted')),{status:response.status})}}
    if(current.replaces){await write(current.replaces,current.replaces.record,isoDate(Date.now()));current.replaces=null}
    if(current.type==='kennelCareSessions')await mirrorCareDuties(current.draft);
    if(current.type==='calendarEvents'&&row.record.completedAt)await completeActivity(row);
    current.dirty=false;closeEditor(true);message('Saved to cloud. Connected apps will receive this change on their next sync.');await load(true);
  }catch(e){$('editError').textContent=e.message;$('editStatus').textContent='Your form is preserved.';if(e.status===401)requireLogin();if(e.status===409){await load(true);const latest=rows.get(current.id);if(latest)showConflict(latest)}}
  finally{saving=false;$('save').disabled=!!editor?.conflict;$('closeEditor').disabled=false;$('cancelEditor').disabled=false}
}
async function remove(row){if(!confirm(`Delete ${recordName(row.record)}? It will also be removed from connected apps. You can restore it from Show deleted.`))return;try{await write(row,row.record,isoDate(Date.now()));await load()}catch(e){message(e.status===409?'Another device changed this record. Refresh and review it before deleting.':e.message)}}
async function restore(row){try{await write(row,row.record);await load()}catch(e){message(e.message)}}
async function toggleCompleted(row){try{await write(row,{...row.record,completed:!row.record.completed});await load(true)}catch(e){message(e.message)}}
async function completeActivity(row){
 if(row.type==='tasks')return toggleCompleted(row);
 const scope=kennel,{current,next}=await calendarCompletion(row);if(scope!==kennel)throw Error('The selected kennel changed. Open the activity again.');
 if(!equal(row.record,current)){const response=await write(row,current);rows.set(row.id,normalizedRow(response.record))}
 if(next&&!rows.has(next.id)){
  try{await write({id:next.id,type:'calendarEvents',revision:0},next)}
  catch(e){if(e.status!==409)throw Error('Activity completed, but the next occurrence needs retrying: '+e.message);await load(true);const existing=rows.get(next.id);if(!existing||existing.type!=='calendarEvents'||existing.record.startDate!==next.startDate)throw Error('Recurring occurrence conflicts with another record. Review Calendar history.')}
 }
 if(scope===kennel)await load(true);
}
async function mirrorCareDuties(session){
 const system=session.shift||(['Morning','Afternoon','Night'][new Date(session.timestamp).getHours()<12?0:new Date(session.timestamp).getHours()<18?1:2]);
 const shift=[...rows.values()].find(r=>r.type==='dailyDutyShifts'&&!r.deleted_at&&r.record.systemName===system)?.record.name||system;
 const key=dayKey(session.timestamp),items=[['kennelCleaned','Kennel cleaned'],['waterChanged','Water changed / refreshed'],['fed','Fed'],['medicationGiven','Medication given'],['exerciseCompleted','Exercise / walk completed'],['bathroomBreak','Bathroom break completed']];
 for(const [flag,title] of items){
  if(!session[flag])continue;
  let template=[...rows.values()].find(r=>r.type==='dailyDutyTemplates'&&!r.deleted_at&&r.record.shift===shift&&r.record.title.trim().toLowerCase()===title.toLowerCase());
  if(!template&&canWrite(role,'dailyDutyTemplates')){const id=await stableID('kennel-care-duty|'+shift+'|'+title);try{const response=await write({id,type:'dailyDutyTemplates',revision:0},{id,title,shift});template=normalizedRow(response.record);rows.set(id,template)}catch(e){if(e.status!==409)throw e;await load(true);template=rows.get(id)}}
  if(!template)continue;
  const unit=dutyChecklist([...rows.values()],key).find(u=>u.template?.id===template.id);
  if(unit&&!unit.completed){const change=await dutyChange(unit,key,session.timestamp);try{const response=await write(change.row,change.record);rows.set(change.row.id,normalizedRow(response.record))}catch(e){if(e.status!==409)throw e;await load(true)}}
 }
}
function showReport(title,sections){
 const area=$('reportContent');area.replaceChildren(el('p','KENNEL ONE','eyebrow'),el('h2',title),el('p',kennels.find(k=>k.id===kennel)?.name||''),el('p','Generated '+new Date().toLocaleString(),'muted'));
 for(const [name,records] of sections){area.append(el('h3',human(name)));if(!records.length)area.append(el('p','No records.','muted'));for(const record of records){const block=el('dl');for(const [key,value] of Object.entries(record)){if(key==='id'||value==null||value==='')continue;block.append(el('dt',human(key)),el('dd',displayValue(value,key)))}area.append(block)}}
 $('reportDialog').showModal();
}
function showPedigree(title,levels){showReport(title,[]);const chart=el('div',undefined,'pedigree-chart');for(const [i,nodes] of levels.entries()){const column=el('section',undefined,'pedigree-generation');column.append(el('h3',i===0?'Dog':'Generation '+i));const members=el('div',undefined,'pedigree-members');for(const node of nodes){const box=el('div',undefined,'pedigree-dog');box.append(el('strong',node.name));if(node.record?.registrationNumber)box.append(el('small',node.record.registrationNumber));if(node.record?.registeredName&&node.record.registeredName!==node.name)box.append(el('small',node.record.registeredName));members.append(box)}column.append(members);chart.append(column)}$('reportContent').append(chart,el('p','Kennel One · Entries come from saved dog records. Unrecorded ancestors are shown explicitly.','muted'))}
async function showTagQR(row){try{const {qrImage}=await import('./scan-codecs.mjs');const payload=tagPayload(row.record),src=await qrImage(payload);showReport(recordName(row.record)+' · QR label',[['Assignment',[{name:row.record.name,payload,placement:row.record.placementName||row.record.locationName||''}]]]);const image=el('img');image.src=src;image.alt='QR code for '+recordName(row.record);image.width=300;image.height=300;$('reportContent').append(image);const link=el('a','Download QR image');link.href=src;link.download='KennelOne-QR-'+row.id+'.png';$('reportContent').append(link)}catch(e){message('QR could not be generated: '+e.message)}}
function attachDocument(row){const record=newRecord('DocumentRecord'),types={dogs:'DogProfile',puppies:'PuppyProfile',expenses:'ExpenseReceipt',healthRecords:'HealthRecord',contracts:'ContractFile'};record.linkedType=types[row.type]||collections[row.type];record.linkedName=row.id.toUpperCase();record.title=recordName(row.record)+' · Attachment';record.kind=row.type==='expenses'?'Receipt':row.type==='healthRecords'?'Health Record':row.type==='contracts'?'Contract':'Photo';openEditor(null,'documents',record)}
async function replaceFile(row){
  if(!['owner','admin'].includes(role)||!['documents','scannedReports'].includes(row.type))return;
  if(!confirm('Save a replacement version of '+recordName(row.record)+'? The previous version will remain recoverable in Show deleted.'))return;
  const record={...structuredClone(row.record),id:crypto.randomUUID()};delete record.fileName;
  openEditor(null,row.type,record);editor.replaces=row;
  $('editStatus').textContent='Choose a new file. The previous version is kept until this version finishes uploading.';
}

async function download(row){try{const r=await fetch(`/api/kennels/${kennel}/files/${row.id}`,{credentials:'same-origin'});if(!r.ok){const data=await r.json();throw Error(data.error||'File is not uploaded yet')}const url=URL.createObjectURL(await r.blob()),a=el('a');a.href=url;a.download=row.record.fileName||row.id;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}catch(e){message(e.message)}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginButton').disabled=true;try{message();await api('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value})});$('password').value='';await init()}catch(e){message(e.message)}finally{$('loginButton').disabled=false}});
function requireLogin(){if(!$('reauth').open){$('reauthEmail').value=identity?.email||'';$('reauthError').textContent='';$('reauth').showModal()}}
$('reauthForm').addEventListener('submit',async e=>{e.preventDefault();$('reauthSubmit').disabled=true;try{await api('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('reauthEmail').value,password:$('reauthPassword').value})});$('reauthPassword').value='';$('reauth').close();await init();if(editor)$('editStatus').textContent='Signed in. Your unsaved changes are preserved.'}catch(e){$('reauthError').textContent=e.message}finally{$('reauthSubmit').disabled=false}});
$('reauthCancel').addEventListener('click',()=>$('reauth').close());
$('cameraButton').onclick=()=>$('cameraUpload').click();
$('cameraUpload').onchange=()=>{const file=$('cameraUpload').files?.[0];if(!file)return;try{const transfer=new DataTransfer();transfer.items.add(file);$('upload').files=transfer.files;dirty();$('editStatus').textContent='Photo captured. Save to attach it to this record.'}catch{message('Use Choose photo or document to select the captured photo.')}};
$('printReport').onclick=()=>{document.body.classList.add('print-report');window.print()};
$('closeReport').onclick=()=>{$('reportDialog').close();document.body.classList.remove('print-report')};
window.addEventListener('afterprint',()=>document.body.classList.remove('print-report'));
$('logout').addEventListener('click',async()=>{if(!closeEditor())return;try{await api('logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}finally{loadSequence++;employees.reset();workflows.reset();stopScanner?.();stopScanner=null;$('reportDialog').close();$('reportContent').replaceChildren();document.body.classList.remove('print-report');teamMembers=[];rows.clear();identity=null;kennel='';role='';$('workspace').hidden=true;$('login').hidden=false;$('overview').replaceChildren();$('list').replaceChildren();message();setConnection('Signed out')}});
$('kennel').addEventListener('change',async()=>{if(!closeEditor()){$('kennel').value=kennel;return}employees.reset();workflows.reset();stopScanner?.();stopScanner=null;$('reportDialog').close();$('reportContent').replaceChildren();teamMembers=[];kennel=$('kennel').value;rows.clear();role='';render();await load()});
$('refresh').addEventListener('click',()=>load());$('add').addEventListener('click',()=>openEditor());$('collection').addEventListener('change',()=>{selectedDay='';renderList()});$('search').addEventListener('input',renderList);$('deleted').addEventListener('change',renderList);$('recordForm').addEventListener('submit',save);$('closeEditor').addEventListener('click',()=>closeEditor());$('cancelEditor').addEventListener('click',()=>closeEditor());$('editor').addEventListener('cancel',e=>{e.preventDefault();if(!saving)closeEditor()});$('upload').addEventListener('change',dirty);$('print').addEventListener('click',()=>{document.querySelectorAll('#list details').forEach(d=>d.open=true);window.print()});

// Export the currently filtered record list without including deleted records unless requested.
// Prefix formula-like cell values so spreadsheet applications never execute cloud-supplied text.
function exportVisibleRecords(){
  const type=chosen(),term=$('search').value.trim().toLowerCase(),deleted=$('deleted').checked;
  const selected=[...rows.values()].filter(r=>r.type===type&&(deleted?!!r.deleted_at:!r.deleted_at)&&(!term||JSON.stringify(r.record).toLowerCase().includes(term))&&(type!=='calendarEvents'||!selectedDay||localDay(r.record?.startDate)===selectedDay));
  const keys=[...new Set(selected.flatMap(r=>Object.keys(r.record||{})))];
  const safe=value=>{
    const string=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
    const guarded=/^[\\t\\r\\n ]*[=+@-]/.test(string)?"'"+string:string;
    return '"'+guarded.replace(/"/g,'""')+'"';
  };
  const lines=[['recordType','revision','deletedAt',...keys].map(safe).join(','),...selected.map(r=>[r.type,r.revision,r.deleted_at||'',...keys.map(k=>r.record?.[k])].map(safe).join(','))];
  const blob=new Blob(['\\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8'});
  const href=URL.createObjectURL(blob),link=el('a');link.href=href;link.download='kennelone-'+type+(deleted?'-deleted':'')+'-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),10000);
}
const exportButton=button('Export CSV',exportVisibleRecords,'secondary');
$('print').insertAdjacentElement('afterend',exportButton);

window.addEventListener('beforeunload',e=>{if(editor?.dirty){e.preventDefault();e.returnValue=''}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&identity&&!loading&&!saving)load(true)});
setInterval(()=>{if(!document.hidden&&identity&&!loading&&!saving&&!$('reauth').open)load(true)},15000);
let invitationMode=false;
function showJoin(){invitationMode=true;$('join').hidden=false;$('login').hidden=true;$('workspace').hidden=true}
$('showJoin').onclick=showJoin;
$('joinBack').onclick=()=>{invitationMode=false;$('join').hidden=true;$('joinPassword').value='';init()};
$('joinForm').onsubmit=async e=>{e.preventDefault();$('joinSubmit').disabled=true;try{await api('invitations/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:$('joinToken').value.trim(),email:$('joinEmail').value.trim(),name:$('joinName').value.trim(),password:$('joinPassword').value})});await api('logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});employees.reset();identity=null;rows.clear();teamMembers=[];kennel='';role='';invitationMode=false;$('joinPassword').value='';$('joinToken').value='';$('join').hidden=true;$('login').hidden=false;message('Invitation accepted. Sign in with your Business account to start work.');$('email').value=$('joinEmail').value}catch(e){$('joinPassword').value='';$('joinStatus').textContent=e.message}finally{$('joinSubmit').disabled=false}};
const incoming=new URLSearchParams(window.location.hash.slice(1)).get('invite');
if(incoming&&/^[a-f0-9]{64}$/.test(incoming)){$('joinToken').value=incoming;window.history.replaceState(null,'','/');showJoin()}else init();
