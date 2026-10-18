import {handleYardPatrolPortal} from '../../_lib/yardpatrol-portal.mjs';
export const onRequest=({request,env,params})=>handleYardPatrolPortal(request,env,'inbox',String(params.path||''));
