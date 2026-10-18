import {handleYardPatrolPortal} from '../../_lib/yardpatrol-portal.mjs';
export const onRequest=({request,env,params})=>handleYardPatrolPortal(request,env,'portal',String(params.path||''));
