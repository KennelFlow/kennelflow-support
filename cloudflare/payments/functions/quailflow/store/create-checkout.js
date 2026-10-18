import {handleSharedStore} from '../../_lib/shared-store.mjs';
export const onRequest=({request,env})=>handleSharedStore(request,env,'quailflow');
