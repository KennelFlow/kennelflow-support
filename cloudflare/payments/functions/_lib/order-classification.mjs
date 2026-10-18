// Strict identification of Square-verified orders. Do not enqueue arbitrary
// payments into another business's settlement or merchant notifications.
import {catalogs} from './shared-store.mjs';
export const KENNELONE_PRODUCT_NAMES=new Set([
  'Smart Kennel Management Dog Tag',
  'Smart Kennel Management Kennel/Crate Tag',
  'Kennel One NFC Tag','Kennel One-Compatible NFC Tag',
  '5-Pack NFC Tags','10-Pack NFC Tags','25-Pack NFC Tags',
  'NFC Tag + Kennel Holder','5-Kennel Smart Holder Set',
  '10-Kennel Smart Facility Kit'
]);
const quail=new Set(Object.values(catalogs.quailflow).map(x=>x.name));
const rabbit=new Set(Object.values(catalogs.rabbitflow).map(x=>x.name));
const service=new Set(['Kennel One service payment','KennelFlow service payment']);
export function classifyVerifiedOrder(order,payment){
 const lines=Array.isArray(order?.line_items)?order.line_items:[];
 if(!lines.length)return {type:'unrelated',storeName:null};
 const names=lines.map(x=>String(x?.name||''));
 const note=String(payment?.note||'');
 const has=list=>names.some(n=>list.has(n));
 // The service-purchase line is created only by the signed business API.
 if(has(service))return {type:'kennel-service',storeName:null};
 if(note.startsWith('Kennel One Store')&&has(KENNELONE_PRODUCT_NAMES))
  return {type:'store-order',storeName:'Kennel One'};
 if(note.startsWith('QuailFlow Store')&&has(quail))
  return {type:'store-order',storeName:'QuailFlow'};
 if(note.startsWith('RabbitFlow Store')&&has(rabbit))
  return {type:'store-order',storeName:'RabbitFlow'};
 return {type:'unrelated',storeName:null};
}
