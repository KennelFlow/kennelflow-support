import {createEmployees} from './employees.mjs';
import {models,collections,canRead,canWrite,newRecord,normalizedRow,recordName,validateModel,isoDate,uuid} from './records.mjs';
const $=id=>document.getElementById(id);
const labels={dogs:'Dogs',puppies:'Puppies',litters:'Litters',breedingRecords:'Breeding records',healthRecords:'Health records',puppyMedicalRecords:'Puppy medical records',customers:'Puppy buyers',clients:'Clients',tasks:'Tasks',training:'Training',equipment:'Equipment',kennels:'Kennels / areas',documents:'Photos & documents',contracts:'Contracts',payments:'Payments',groomingRecords:'Grooming',feedingPlans:'Feeding plans',supplementRecords:'Supplements',semenRecords:'Semen records',scanFolders:'Report folders',scannedReports:'Scanned reports',boardingRecords:'Boarding',calendarEvents:'Calendar events',employeeActivity:'Employee activity',staffTimeEntries:'Staff time entries',kennelCareSessions:'Kennel care',expenses:'Expenses',dailyDutyShifts:'Duty categories',dailyDutyTemplates:'Duty templates',dailyDutyRecords:'Duty records',smartTags:'QR / NFC assignments',inventoryLocations:'Inventory locations',inventoryItems:'Inventory items',travelManifests:'Travel manifests',inventoryScans:'Inventory scans',inventoryReports:'Inventory reports',smartPlacements:'Tag placements'};
const groups={Overview:[],'Dogs':['dogs'],'Puppies & Litters':['puppies','litters'],'Breeding':['breedingRecords','semenRecords'],'Kennels & Care':['kennels','kennelCareSessions'],'Clients & Boarding':['clients','boardingRecords','customers'],'Health & Grooming':['healthRecords','puppyMedicalRecords','groomingRecords'],'Feeding & Supplements':['feedingPlans','supplementRecords'],'Daily Duties':['dailyDutyRecords','dailyDutyTemplates','dailyDutyShifts'],'Calendar':['calendarEvents','tasks'],'Training':['training'],'Equipment & Inventory':['equipment','inventoryItems','inventoryLocations'],'Expenses & Payments':['expenses','payments'],'Contracts':['contracts'],'Photos & Documents':['documents','scannedReports','scanFolders'],'QR / NFC':['smartTags','smartPlacements'],'Travel & Reports':['travelManifests','inventoryScans','inventoryReports'],'Staff Records':['employeeActivity','staffTimeEntries'],'Employees':[]};
const referenceTypes={puppyID:['puppies'],litterID:['litters'],linkedLitterID:['litters'],linkedDogID:['dogs'],linkedPuppyID:['puppies'],dogID:['dogs'],kennelID:['kennels'],areaID:['kennels','inventoryLocations'],vehicleAreaID:['inventoryLocations'],placementID:['smartPlacements'],clientID:['clients'],templateID:['dailyDutyTemplates'],folderID:['scanFolders'],tagID:['smartTags'],containerTagID:['smartTags'],tripID:['travelManifests'],itemID:['inventoryItems']};
let teamMembers=[];
let rows=new Map(),identity=null,kennels=[],kennel='',role='',active='Overview',loading=false,loadSequence=0,editor=null,saving=false;
let month=new Date(new Date().getFullYear(),new Date().getMonth(),1),selectedDay='';
const employees=createEmployees({host:$('employeesPanel'),api,state:()=>({rows,identity,kennel,role}),onMembers:value=>{teamMembers=value},onError:e=>{message(e.message);if(e.status===401)requireLogin()},refresh:()=>load(),edit:row=>openEditor(row),add:type=>openEditor(null,type)});
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
function visibleGroups(){return Object.entries(groups).filter(([name,types])=>name==='Overview'||name==='Employees'&&!!role||types.some(t=>canRead(role,t)))}
function selectSection(name){active=name;selectedDay='';renderNav();renderPanel()}
function renderNav(){
  $('nav').replaceChildren();
  if(!visibleGroups().some(([name])=>name===active))active='Overview';
  for(const [name] of visibleGroups()){const b=button(name,()=>selectSection(name),'');b.classList.toggle('active',name===active);b.setAttribute('aria-current',name===active?'page':'false');$('nav').append(b)}
}
function render(background=false){renderNav();renderOverview();renderPanel(background)}
function renderOverview(){
  const box=$('overview');box.replaceChildren();const intro=el('section',undefined,'intro');intro.append(el('p','ONE CONNECTED KENNEL','eyebrow'),el('h2','Your records, wherever you work'),el('p','Manage shared records here and continue in the KennelFlow app. Open devices check for updates automatically. If both devices change a record, you choose which changes to keep.'));box.append(intro);
  const grid=el('div',undefined,'metrics');
  for(const [name,types] of visibleGroups().filter(([name])=>name!=='Overview')){const b=button('',()=>selectSection(name),'metric'),count=[...rows.values()].filter(r=>types.includes(r.type)&&!r.deleted_at).length;b.append(el('h3',name),el('strong',name==='Employees'?(['owner','admin'].includes(role)?String(teamMembers.length):'Open'):String(count)),el('span',name==='Employees'?(['owner','admin'].includes(role)?'Team members':'Time & work history'):'Shared records'));grid.append(b)}
  box.append(grid);
  if(!rows.size)box.append(el('p','No shared records yet. Connect this Business account in your app and sync existing records, or add a record here.','card'));
}
function renderPanel(background=false){
  const overview=active==='Overview',staff=active==='Employees';$('overview').hidden=!overview;$('recordsPanel').hidden=overview||staff;$('employeesPanel').hidden=!staff;if(staff){employees.render(background);return}if(overview)return;
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
  renderCalendar(type,list);
  renderSpecialized(type,list);
  if(type==='calendarEvents'&&selectedDay)list=list.filter(r=>localDay(r.record?.startDate)===selectedDay);
  list.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
  $('count').textContent=`${list.length} ${deleted?'deleted ':''}record${list.length===1?'':'s'}${selectedDay?' · '+selectedDay:''}`;
  $('list').replaceChildren();
  for(const row of list){
    const card=el('article',undefined,'record'+(row.deleted_at?' deleted':'')),head=el('div',undefined,'record-head'),text=el('div'),actions=el('div',undefined,'actions');
    text.append(el('h3',recordName(row.record)),el('p',[row.record?.status,row.record?.category,row.record?.date||row.record?.startDate?new Date(row.record.date||row.record.startDate).toLocaleDateString():null].filter(Boolean).join(' · '),'muted'));
    if(canWrite(role,type)&&row.record){actions.append(button(row.deleted_at?'Restore':'Edit',()=>row.deleted_at?restore(row):openEditor(row)));if(!row.deleted_at)actions.append(button('Delete',()=>remove(row),'danger'))}
    if(!row.deleted_at&&['documents','scannedReports'].includes(type)&&['owner','admin'].includes(role)){actions.append(button('Download',()=>download(row)));actions.append(button('Replace file',()=>replaceFile(row)));}
    if(!row.deleted_at&&type==='tasks'&&canWrite(role,type))actions.append(button(row.record.completed?'Reopen':'Complete',()=>toggleCompleted(row)));
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
  host.replaceChildren();
  if(type==='dailyDutyRecords'){
    const today=localDay(new Date()),todayRecords=list.filter(r=>r.record?.dateKey===today);
    const panel=el('section',undefined,'specialized-panel');panel.append(el('h3',"Today's duty checklist"),el('p',"Today's saved duties only. Completing a duty writes to the shared cloud record; other days remain in history.",'muted'));
    for(const row of todayRecords){
      const line=el('div',undefined,'specialized-line'),label=el('span',(row.record.shift||'Duty')+' · '+row.record.taskTitle);
      line.append(label,el('span',row.record.completed?'Completed':'Pending','muted'));
      if(canWrite(role,type))line.append(button(row.record.completed?'Reopen':'Complete',async()=>{
        try{const finished=!row.record.completed;await write(row,{...row.record,completed:finished,...(finished?{completedAt:isoDate(Date.now())}:{completedAt:undefined})});await load(true);renderList()}
        catch(e){message(e.message)}
      }));
      panel.append(line);
    }
    if(!todayRecords.length)panel.append(el('p','No duties are saved for today. Use Add duty records or manage duty templates.','muted'));
    host.append(panel);
  }
  if(type==='payments'){
    const live=list.filter(r=>!r.deleted_at),amount=key=>live.reduce((total,r)=>total+(Number(r.record?.[key])||0),0);
    const panel=el('section',undefined,'specialized-panel');
    panel.append(el('h3','Payment ledger'),el('p','These are saved payment records, not live Square transactions. To charge a card, use the authorized payment flow in the app.','muted'));
    panel.append(el('p',live.length+' payment records · Review individual entries below.','muted'));host.append(panel);
  }
  if(type==='smartTags'){
    const panel=el('section',undefined,'specialized-panel');panel.append(el('h3','QR / NFC assignment lookup'),el('p','Search by tag name, linked ID, or QR payload. This page does not write physical NFC tags. Use the iPhone app for NFC programming.','muted'));
    const field=el('label','Tag or QR payload'),input=el('input');input.type='search';input.placeholder='Paste a scanned QR code or tag ID';field.append(input);
    const result=el('div');input.addEventListener('input',()=>{
      const value=input.value.trim().toLowerCase();result.replaceChildren();
      if(!value)return;
      const matches=list.filter(r=>!r.deleted_at&&Object.values(r.record||{}).some(v=>typeof v==='string'&&v.toLowerCase().includes(value)));
      for(const row of matches.slice(0,10)){const match=el('div',undefined,'specialized-line');match.append(el('strong',recordName(row.record)),button('View / edit',()=>openEditor(row)));result.append(match)}
      if(!matches.length)result.append(el('p','No matching saved assignments.','muted'));
    });
    panel.append(field,result);host.append(panel);
  }
}

function displayValue(value,key){if(typeof value==='boolean')return value?'Yes':'No';if(Array.isArray(value))return value.map(x=>typeof x==='object'?Object.entries(x).filter(([k])=>k!=='id').map(([k,v])=>human(k)+': '+displayValue(v,k)).join(' · '):String(x)).join('\n');if(typeof value==='object')return JSON.stringify(value);if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value))return new Date(value).toLocaleString();return String(value)}
function renderCalendar(type,list){
  const box=$('calendar');box.replaceChildren();if(type!=='calendarEvents')return;
  const bar=el('div',undefined,'calendar-bar');bar.append(button('Previous month',()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);selectedDay='';renderList()}),el('strong',month.toLocaleString([],{month:'long',year:'numeric'})),button('Next month',()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);selectedDay='';renderList()}));box.append(bar);
  const grid=el('div',undefined,'calendar-grid');for(const day of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])grid.append(el('small',day));
  for(let n=0;n<month.getDay();n++)grid.append(el('span'));
  const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  for(let d=1;d<=days;d++){const key=localDay(new Date(month.getFullYear(),month.getMonth(),d)),count=list.filter(r=>localDay(r.record?.startDate)===key).length,b=button(String(d),()=>{selectedDay=selectedDay===key?'':key;renderList()},'');b.classList.toggle('selected',key===selectedDay);b.setAttribute('aria-label',key+(count?` · ${count} events`:''));if(count)b.append(el('small',`${count} event${count===1?'':'s'}`));grid.append(b)}box.append(grid);
  if(selectedDay)box.append(button('Show all dates',()=>{selectedDay='';renderList()}));
}
function closeEditor(force=false){if(!force&&editor?.dirty&&!confirm('Discard your unsaved changes?'))return false;$('editor').close();editor=null;$('upload').value='';return true}
function openEditor(row,typeOverride){
  const type=row?.type||typeOverride||chosen();if(!canWrite(role,type))return;
  const record=row?structuredClone(row.record):newRecord(collections[type]);
  if(!record){message('This record has an unsupported format. Its cloud copy was preserved.');return}
  if(!row&&type==='calendarEvents'&&selectedDay)record.startDate=isoDate(selectedDay+'T09:00:00');
  editor={id:(row?.id||record.id).toLowerCase(),type,revision:row?.revision||0,base:structuredClone(record),draft:record,dirty:!row,kennel,conflict:null};
  $('editorTitle').textContent=(row?'Edit ':'Add ')+(labels[type]||'record');$('editorSubtitle').textContent='CHANGES SYNC WITH YOUR APP';$('editError').textContent='';$('editStatus').textContent='';$('upload').value='';$('uploadLabel').hidden=!['documents','scannedReports'].includes(type)||!!row;$('conflict').hidden=true;$('save').disabled=false;
  $('fields').replaceChildren();renderObject(collections[type],editor.draft,$('fields'));
  $('editor').showModal();
}
function dirty(){if(editor){editor.dirty=true;$('editStatus').textContent='Unsaved changes'}}
function renderObject(model,object,parent){
  for(const field of models[model]||[]){
    if(field.key==='id'||(['documents','scannedReports'].includes(editor?.type)&&field.key==='fileName'))continue;
    const label=el('label',human(field.key)),value=object[field.key],type=field.type;
    if(type.startsWith('[')){parent.append(renderArray(field,object));continue}
    let control;
    if(field.key==='assignedTo'&&teamMembers.length){
      control=el('select');const blank=el('option','Unassigned');blank.value='';control.append(blank);
      const names=[...new Set(teamMembers.map(m=>m.name||m.email))];if(value&&!names.includes(value))names.unshift(value);
      for(const name of names){const option=el('option',name);option.value=name;control.append(option)}control.value=value||'';
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
    else if(type==='String'&&/notes|instructions|text|description|detail|body|plan/i.test(field.key)){control=el('textarea');control.value=value||'';label.classList.add('wide')}
    else {control=el('input');control.type=type==='Date'?'datetime-local':['Double','Int','Int64'].includes(type)?'number':field.key.toLowerCase().includes('email')?'email':'text';if(type==='Date')control.step='1';if(control.type==='number')control.step=type==='Double'?'any':'1';control.value=value==null?'':type==='Date'?dateInput(value):String(value)}
    control.required=!field.optional&&type!=='Bool';control.dataset.field=field.key;
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
async function write(row,record,deletedAt){return api(`kennels/${kennel}/records/${row.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:row.type,expectedRevision:row.revision,record,...(deletedAt?{deletedAt}:{})})})}
async function save(event){
  event.preventDefault();if(!editor||saving||editor.conflict)return;
  const current=editor;if(current.kennel!==kennel)return;
  $('editError').textContent='';const upload=$('upload').files[0];
  if(['documents','scannedReports'].includes(current.type)&&current.revision===0){if(!upload){$('editError').textContent='Choose a photo or document first.';return}const ext=(upload.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').slice(0,12)||'bin';current.draft.fileName=current.id+'.'+ext}
  if(upload&&upload.size>10485760){$('editError').textContent='Choose a file smaller than 10 MB.';return}
  const error=validateModel(collections[current.type],current.draft);if(error){$('editError').textContent=human(error);return}
  saving=true;$('save').disabled=true;$('closeEditor').disabled=true;$('cancelEditor').disabled=true;$('editStatus').textContent='Saving…';
  try{
    const data=await write(current,current.draft),row=normalizedRow(data.record);
    if(!uuid(row.id)||row.id.toLowerCase()!==current.id.toLowerCase()||row.revision<=current.revision)throw Error('Cloud acknowledgement was invalid. Refresh before retrying.');
    current.revision=row.revision;current.base=structuredClone(current.draft);rows.set(row.id,row);
    if(upload){const response=await fetch(`/api/kennels/${kennel}/files/${current.id}`,{method:'PUT',credentials:'same-origin',body:upload});if(!response.ok){const value=await response.json();throw Object.assign(Error('Record saved, but the file upload needs retrying: '+(value.error||'connection interrupted')),{status:response.status})}}
    current.dirty=false;closeEditor(true);message('Saved to cloud. Connected apps will receive this change on their next sync.');await load(true);
  }catch(e){$('editError').textContent=e.message;$('editStatus').textContent='Your form is preserved.';if(e.status===401)requireLogin();if(e.status===409){await load(true);const latest=rows.get(current.id);if(latest)showConflict(latest)}}
  finally{saving=false;$('save').disabled=!!editor?.conflict;$('closeEditor').disabled=false;$('cancelEditor').disabled=false}
}
async function remove(row){if(!confirm(`Delete ${recordName(row.record)}? It will also be removed from connected apps. You can restore it from Show deleted.`))return;try{await write(row,row.record,isoDate(Date.now()));await load()}catch(e){message(e.status===409?'Another device changed this record. Refresh and review it before deleting.':e.message)}}
async function restore(row){try{await write(row,row.record);await load()}catch(e){message(e.message)}}
async function toggleCompleted(row){try{await write(row,{...row.record,completed:!row.record.completed});await load(true)}catch(e){message(e.message)}}
async function replaceFile(row){
  if(!['owner','admin'].includes(role)||!['documents','scannedReports'].includes(row.type))return;
  const picker=el('input');picker.type='file';picker.accept='image/*,.pdf,.txt,.doc,.docx';
  picker.addEventListener('change',async()=>{
    const file=picker.files?.[0];if(!file)return;
    if(file.size>10485760){message('File must be 10 MB or smaller.');return}
    if(!confirm('Replace the cloud file for '+recordName(row.record)+'? The previous file will no longer be available.'))return;
    const scope=kennel;
    try{
      const current=rows.get(row.id);
      if(!current||current.revision!==row.revision){message('This record changed. Refresh and try again.');return}
      const response=await fetch('/api/kennels/'+scope+'/files/'+row.id,{method:'PUT',credentials:'same-origin',body:file,headers:{'X-Requested-With':'KennelFlowWeb'}});
      const detail=await response.json().catch(()=>({}));
      if(!response.ok)throw Object.assign(Error(detail.error||'Upload failed'),{status:response.status});
      message('Document file updated in cloud. The record metadata remains unchanged.');
    }catch(e){message(e.message);if(e.status===401)requireLogin()}
  });
  picker.click();
}
async function download(row){try{const r=await fetch(`/api/kennels/${kennel}/files/${row.id}`,{credentials:'same-origin'});if(!r.ok){const data=await r.json();throw Error(data.error||'File is not uploaded yet')}const url=URL.createObjectURL(await r.blob()),a=el('a');a.href=url;a.download=row.record.fileName||row.id;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}catch(e){message(e.message)}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginButton').disabled=true;try{message();await api('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value})});$('password').value='';await init()}catch(e){message(e.message)}finally{$('loginButton').disabled=false}});
function requireLogin(){if(!$('reauth').open){$('reauthEmail').value=identity?.email||'';$('reauthError').textContent='';$('reauth').showModal()}}
$('reauthForm').addEventListener('submit',async e=>{e.preventDefault();$('reauthSubmit').disabled=true;try{await api('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('reauthEmail').value,password:$('reauthPassword').value})});$('reauthPassword').value='';$('reauth').close();await init();if(editor)$('editStatus').textContent='Signed in. Your unsaved changes are preserved.'}catch(e){$('reauthError').textContent=e.message}finally{$('reauthSubmit').disabled=false}});
$('reauthCancel').addEventListener('click',()=>$('reauth').close());
$('logout').addEventListener('click',async()=>{if(!closeEditor())return;try{await api('logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}finally{loadSequence++;employees.reset();teamMembers=[];rows.clear();identity=null;kennel='';role='';$('workspace').hidden=true;$('login').hidden=false;$('overview').replaceChildren();$('list').replaceChildren();message();setConnection('Signed out')}});
$('kennel').addEventListener('change',async()=>{if(!closeEditor()){$('kennel').value=kennel;return}employees.reset();teamMembers=[];kennel=$('kennel').value;rows.clear();role='';render();await load()});
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
  const href=URL.createObjectURL(blob),link=el('a');link.href=href;link.download='kennelflow-'+type+(deleted?'-deleted':'')+'-'+new Date().toISOString().slice(0,10)+'.csv';
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
