import {handleDirectPayment} from '../_lib/direct-card-payments.mjs';
export const onRequest=({request,env})=>handleDirectPayment(request,env,'charge');
