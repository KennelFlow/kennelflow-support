import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHmac,webcrypto} from 'node:crypto';
import {processWebhook} from '../functions/square/webhook.js';
import {settleVerifiedServicePayment} from '../functions/_lib/settlement.mjs';
globalThis.crypto||=webcrypto;
globalThis.atob||=(s)=>Buffer.from(s,'base64').toString('binary');
import {paymentRecordId} from '../functions/_lib/settlement.mjs';

// Real PostgreSQL WASM engine, isolated and ephemeral. Does NOT touch Neon.
async function setup() {
  const db=new PGlite();
  await db.exec(`
    CREATE TABLE kennels(id uuid primary key, name text not null);
    CREATE TABLE kennel_records (
      id uuid not null, kennel_id uuid not null,
      record_type text not null, schema_version integer default 1,
      revision bigint default 1, payload jsonb not null,
      updated_at timestamptz default now(), deleted_at timestamptz,
      primary key (kennel_id,id)
    );
    CREATE TABLE public.kennelflow_square_checkouts (
      order_id text primary key,
      kennel_id uuid not null, environment text not null,
      customer_name text not null, amount_cents bigint not null,
      reference text not null default '', checkout_url text not null default '',
      status text not null default 'AWAITING_CUSTOMER_PAYMENT',
      created_at timestamptz default now(), updated_at timestamptz default now(),
      payment_id text
    );
    INSERT INTO kennels VALUES ('30b613f9-9b47-40a1-b0ec-9bb2210428f0', 'Sandbox Test Kennel');
    INSERT INTO kennelflow_square_checkouts (order_id,kennel_id,environment,customer_name,amount_cents)
      VALUES ('test-order','30b613f9-9b47-40a1-b0ec-9bb2210428f0','sandbox','Sandbox Buyer',499);
  `);
  await db.exec(await readFile(new URL('../db/settle-service-payment-v1.sql',import.meta.url),'utf8'));
  return db;
}
const recordFor=async(p='sandbox-payment',e='sandbox')=>paymentRecordId(p,e);
const settle=async(db,{order='test-order',payment='sandbox-payment',amount=499,env='sandbox',id}={})=>{
  const record=id||await recordFor(payment,env);
  return (await db.query(
    'SELECT * FROM public.ko_settle_service_payment_v1($1::text,$2::text,$3::bigint,$4::text,$5::uuid)',
    [order,payment,amount,env,record]
  )).rows[0];
};
test('a verified payment atomically creates exactly one ledger record and settles pending checkout',async()=>{
  const db=await setup();
  try{
    const first=await settle(db);
    assert.deepEqual(first,{saved:true,already_recorded:false,ignored:false});
    const checkout=(await db.query('SELECT status,payment_id FROM kennelflow_square_checkouts WHERE order_id=$1',['test-order'])).rows[0];
    assert.deepEqual(checkout,{status:'COMPLETED',payment_id:'sandbox-payment'});
    const ledgers=(await db.query('SELECT record_type,payload FROM kennel_records')).rows;
    assert.equal(ledgers.length,1);
    assert.equal(ledgers[0].record_type,'payments');
    assert.equal(ledgers[0].payload.record.amount,4.99);
    assert.equal(ledgers[0].payload.record.method,'Square Sandbox — TEST ONLY');
    assert.equal(ledgers[0].payload.record.reference,'sandbox-payment');
    assert.equal(ledgers[0].payload.record.customerName,'Sandbox Buyer');
    const next=await settle(db);
    assert.deepEqual(next,{saved:false,already_recorded:true,ignored:false});
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM kennel_records')).rows[0].count,1);
  } finally{await db.close()}
});
test('amount mismatch rejects and does not change checkout or ledger',async()=>{
  const db=await setup();
  try{
    await assert.rejects(()=>settle(db,{amount:500}),/amount mismatch/);
    assert.equal((await db.query('SELECT status FROM kennelflow_square_checkouts')).rows[0].status,'AWAITING_CUSTOMER_PAYMENT');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM kennel_records')).rows[0].n,0);
  } finally{await db.close()}
});
test('different payment ID cannot settle same completed order',async()=>{
  const db=await setup();
  try{
    await settle(db);
    await assert.rejects(()=>settle(db,{payment:'other-payment'}),/Conflicting Square payment ID/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM kennel_records')).rows[0].n,1);
  } finally{await db.close()}
});
test('nonexistent checkout is ignored with no ledger mutation',async()=>{
  const db=await setup();
  try{
    assert.deepEqual(await settle(db,{order:'not-created'}),{saved:false,already_recorded:false,ignored:true});
    assert.equal((await db.query('SELECT count(*)::int AS n FROM kennel_records')).rows[0].n,0);
  }finally{await db.close()}
});
test('conflicting deterministic record rolls back the whole transaction',async()=>{
  const db=await setup();
  try{
    const id=await recordFor();
    await db.query(`INSERT INTO kennel_records(id,kennel_id,record_type,payload)
      VALUES ($1, '30b613f9-9b47-40a1-b0ec-9bb2210428f0', 'payments',
      '{"record":{"reference":"someone-else","method":"Square","amount":99}}'::jsonb)`,[id]);
    await assert.rejects(()=>settle(db),/Existing payment record conflict/);
    const row=(await db.query('SELECT status,payment_id FROM kennelflow_square_checkouts')).rows[0];
    assert.equal(row.status,'AWAITING_CUSTOMER_PAYMENT');
    assert.equal(row.payment_id,null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM kennel_records')).rows[0].n,1);
  }finally{await db.close()}
});
test('already settled record with modified amount cannot be falsely acknowledged',async()=>{
  const db=await setup();
  try{
    await settle(db);
    await db.query('UPDATE kennel_records SET payload=jsonb_set(payload,\'{record,amount}\',\'500\'::jsonb)');
    await assert.rejects(()=>settle(db),/Existing payment record conflict/);
  }finally{await db.close()}
});
test('canceled checkouts cannot create completed ledger rows',async()=>{
  const db=await setup();
  try{
    await db.query(`UPDATE kennelflow_square_checkouts SET status='CANCELLED'`);
    await assert.rejects(()=>settle(db),/cannot be settled/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM kennel_records')).rows[0].n,0);
  }finally{await db.close()}
});
test('sandbox ledger row cannot be relabeled as production revenue',async()=>{
  const db=await setup();
  try{
    assert.deepEqual(await settle(db,{env:'production'}),{saved:false,already_recorded:false,ignored:true});
    assert.equal((await db.query('SELECT count(*)::int AS n FROM kennel_records')).rows[0].n,0);
  }finally{await db.close()}
});

test('end-to-end signed Square webhook -> verified payment -> real atomic PostgreSQL ledger -> D1 state, with retry safety',async()=>{
  const pg=await setup();
  const rows=new Map();
  const D1={
    prepare(sql){
      let args=[];
      return {
        bind(...a){args=a;return this},
        async run(){
          if(sql.startsWith('INSERT')&&!rows.has(args[0]))
            rows.set(args[0],{status:args[4],order_id:args[2],kind:args[3]});
          if(sql.startsWith('UPDATE')&&rows.has(args[0]))
            rows.get(args[0]).status='SETTLED';
          return {success:true};
        },
        async first(){return rows.get(args[0])||null}
      };
    }
  };
  const site='https://test-webhook.example/square/webhook';
  const env={
    SQUARE_WEBHOOK_SIGNATURE_KEY:'synthetic-nonprod-hmac-only',
    SQUARE_WEBHOOK_URL:site,
    SQUARE_ACCESS_TOKEN:'synthetic-never-live',
    SQUARE_LOCATION_ID:'fake-location',
    SQUARE_ENVIRONMENT:'sandbox',
    DATABASE_URL:'postgres://disposable-local',
    ENABLE_ATOMIC_SERVICE_SETTLEMENT:'true',
    EVENTS:D1
  };
  const event={
    type:'payment.updated',event_id:'test-transaction-event',
    data:{object:{payment:{id:'sandbox-payment',status:'COMPLETED',order_id:'test-order',location_id:'fake-location'}}}
  };
  const request=()=>{
    const body=JSON.stringify(event),sig=createHmac('sha256',env.SQUARE_WEBHOOK_SIGNATURE_KEY).update(site+body).digest('base64');
    return new Request(site,{method:'POST',headers:{'x-square-hmacsha256-signature':sig,'content-type':'application/json'},body});
  };
  const square=async(url)=>{
    if(url.includes('/v2/payments/'))return Response.json({payment:{
      id:'sandbox-payment',status:'COMPLETED',order_id:'test-order',location_id:'fake-location',
      amount_money:{amount:499,currency:'USD'}
    }});
    if(url.includes('/v2/orders/'))return Response.json({order:{
      id:'test-order',location_id:'fake-location',total_money:{amount:499,currency:'USD'},
      line_items:[{name:'Kennel One service payment'}]
    }});
    throw Error('Unexpected external call');
  };
  let sqlCalls=0;
  const bridge=async(verification,env)=>{
    return settleVerifiedServicePayment(verification,env,async(_conn,params)=>{
      sqlCalls++;
      return (await pg.query('SELECT * FROM public.ko_settle_service_payment_v1($1::text,$2::text,$3::bigint,$4::text,$5::uuid)',params)).rows;
    });
  };
  try{
    const response=await processWebhook(request(),env,square,bridge);
    assert.equal(response.status,200);
    assert.equal((await response.json()).saved,true);
    assert.equal(rows.size,1);
    assert.equal(rows.get('sandbox-payment').status,'SETTLED');
    assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM kennel_records')).rows[0].n,1);
    assert.equal((await pg.query('SELECT status FROM kennelflow_square_checkouts')).rows[0].status,'COMPLETED');
    const replay=await processWebhook(request(),env,square,bridge);
    assert.equal(replay.status,200);
    assert.equal(sqlCalls,1);
    assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM kennel_records')).rows[0].n,1);
  }finally{await pg.close()}
});
