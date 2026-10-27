const $=id=>document.getElementById(id);
const add=(tag,value,cls)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=String(value);if(cls)node.className=cls;return node};
const count=value=>value==null?'Not connected':String(value);
const countZero=value=>value==null?'0':String(value);
async function api(path) {
  const res=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const data=await res.json().catch(()=>({error:'Invalid reporting response'}));
  if(!res.ok)throw Object.assign(Error(data.error||'Reporting unavailable'),{status:res.status});
  return data;
}
function metric(name,value,hint='') {
  const card=add('div',undefined,'owner-metric');
  card.append(add('span',name),add('strong',value));
  if(hint)card.append(add('small',hint));
  return card;
}
function present(last) {
  const stamp=Date.parse(last||'');
  return Number.isFinite(stamp)?new Date(stamp).toLocaleString():'Not recorded';
}
function display(data,customers){
  $('accountSummary').replaceChildren(
    metric('Business Cloud accounts',countZero(data.accounts_total),'Not the number of store downloads'),
    metric('Online in last 5 minutes',countZero(data.active_5m),'Signed-in accounts'),
    metric('Active in 24 hours',countZero(data.active_24h),'Signed-in accounts'),
    metric('Active in 30 days',countZero(data.active_30d),'Signed-in accounts')
  );
  const subscriptions=data.subscriptions||{};
  const subs=$('subscriptionSummary');subs.replaceChildren(
    metric('Active and lifetime',countZero(subscriptions.active)),
    metric('Active trials',countZero(subscriptions.trial))
  );
  for(const [provider,amount] of Object.entries(subscriptions.by_provider||{})){
    subs.append(metric('Provider: '+provider,countZero(amount)));
  }
  const cards=$('platformCards');cards.replaceChildren();
  for(const [platform,label] of [['ios','iOS / App Store'],['android','Android / Google Play'],['windows','Windows / Microsoft Store'],['web','Web browser']]){
    const values=data.platforms?.[platform]||{};
    const card=add('article',undefined,'owner-metric');
    card.append(add('h3',label));
    if(platform!=='web') {
      card.append(metric('Store downloads / installs',count(values.store_downloads),values.store_downloads==null?'Official store analytics not connected':(values.store_metric||'Store figure')+' · '+(values.store_as_of||'Date unavailable')));
    }
    card.append(
      metric('Signed-in accounts seen',countZero(values.registered_ever)),
      metric('Online in 5 minutes',countZero(values.registered_active_5m)),
      metric('Active in 30 days',countZero(values.registered_active_30d)),
      metric('Activity intervals',countZero(values.activity_events))
    );
    cards.append(card);
  }
  const tbody=$('customerRows');tbody.replaceChildren();
  for(const item of customers) {
    const tr=add('tr');
    for(const v of [
      item.name||'Customer',item.email||'',
      item.online?'Online':'Offline',String(item.last_platform||'Unknown').toUpperCase(),
      present(item.last_seen_at),
      [item.subscription_plan,item.subscription_state,item.subscription_provider].filter(Boolean).join(' / ')||'Unknown'
    ])tr.append(add('td',v));
    tbody.append(tr);
  }
  if(!customers.length){
    const tr=add('tr'),cell=add('td','No Business Cloud customers returned');
    cell.colSpan=6;tr.append(cell);tbody.append(tr);
  }
  $('ownerData').hidden=false;
  $('ownerStatus').textContent='Updated '+new Date().toLocaleTimeString()+'. Reported accounts: '+customers.length+'.';
}
async function refresh(){
  $('reload').disabled=true;
  $('ownerStatus').textContent='Checking authorization and updating report…';
  try {
    const [summary,customers]=await Promise.all([
      api('platform-owner/overview'),api('platform-owner/activity')
    ]);
    if(!Array.isArray(customers.customers))throw Error('Unexpected customer report');
    display(summary,customers.customers);
  } catch(e) {
    $('ownerData').hidden=true;
    $('ownerStatus').textContent=e.status===401
      ?'Sign in to Business Cloud first, then open this page again.'
      :e.status===403
       ?'Platform owner authorization is required to view this report.'
       :'Owner dashboard is temporarily unavailable. No customer data was displayed.';
  } finally {$('reload').disabled=false}
}
$('reload').addEventListener('click',refresh);
refresh();
