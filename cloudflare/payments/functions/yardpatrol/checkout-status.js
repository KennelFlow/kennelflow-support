import {handleYardPatrol} from '../_lib/yardpatrol-checkout.mjs';
export const onRequest=({request,env})=>handleYardPatrol(request,env,'status');
