import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyVerifiedOrder} from '../functions/_lib/order-classification.mjs';
const classify=(label,note)=>classifyVerifiedOrder({line_items:[{name:label}]},{note});
test('Kennel One recognizes currently sold and grandfathered tag names',()=>{
 assert.deepEqual(classify('Kennel One-Compatible NFC Tag','Kennel One Store • Customer'),{type:'store-order',storeName:'Kennel One'});
 assert.deepEqual(classify('Kennel One NFC Tag','Kennel One Store • Customer'),{type:'store-order',storeName:'Kennel One'});
});
test('QuailFlow and RabbitFlow orders do not get attributed to Kennel One',()=>{
 assert.deepEqual(classify('5 Quail + Embedded NFC','QuailFlow Store • Customer'),{type:'store-order',storeName:'QuailFlow'});
 assert.deepEqual(classify('5 Rabbits + Embedded NFC','RabbitFlow Store • Customer'),{type:'store-order',storeName:'RabbitFlow'});
 assert.equal(classify('5 Quail + Embedded NFC','Kennel One Store • Customer').type,'unrelated');
});
test('Kennel One service payments remain separately classified for atomic ledger settlement',()=>{
 assert.equal(classify('Kennel One service payment','Kennel One Service').type,'kennel-service');
});
test('unknown merchandise and unrecognized Square orders are never misclassified',()=>{
 assert.equal(classify('Unknown item','Kennel One Store').type,'unrelated');
 assert.equal(classify('Kennel One NFC Tag','Other store').type,'unrelated');
});
