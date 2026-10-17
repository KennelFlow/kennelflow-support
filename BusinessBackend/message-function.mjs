import {createAPI} from './api.mjs';

// Narrow sidecar to avoid replacing the authenticated production sync API.
// Only the existing token/session semantics are shared; all other account,
// record, payment, and signup URLs remain on their unchanged production host.
export function createPrivateMessageFunction(repo) {
  const api=createAPI(repo);
  return {
    async fetch(request) {
      const url=new URL(request.url);
      const path=url.pathname.replace(/^\/kennelprivmsg(?=\/|$)/,'');
      if(request.method==='GET'&&path==='/health')
        return Response.json({ok:true,service:'Kennel One private messages',revision:1},{
          headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}
        });
      const match=/^\/v2\/kennels\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\/private-messages$/i.test(path);
      if(!match)return Response.json({error:'Not found'},{status:404});
      if(!['GET','POST'].includes(request.method))
        return Response.json({error:'Method not allowed'},{status:405,headers:{'Allow':'GET, POST'}});
      const uri=new URL(request.url);
      uri.pathname=path;
      return api.fetch(new Request(uri,request));
    }
  }
}
