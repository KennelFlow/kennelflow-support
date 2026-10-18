import {handleYardPatrolPortal} from '../_lib/yardpatrol-portal.mjs';
export const onRequest=({request,env})=>handleYardPatrolPortal(request,env,'leads','create');
