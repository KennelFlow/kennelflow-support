// Read-only environment readiness; never reveals credentials.
export async function onRequest({request,env={}}){
  if(request.method!=='GET')return new Response('Method not allowed',{status:405});
  return Response.json({
    ok:true,
    service:'Kennel One payments staging',
    squareCredentialsConfigured:!!(env.SQUARE_ACCESS_TOKEN&&env.SQUARE_LOCATION_ID),
    signatureVerificationConfigured:!!(env.SQUARE_WEBHOOK_SIGNATURE_KEY&&env.SQUARE_WEBHOOK_URL),
    neonSettlementConfigured:!!env.DATABASE_URL,
    eventStorageConfigured:!!env.EVENTS,
    settlementEnabled:env.ENABLE_ATOMIC_SERVICE_SETTLEMENT==='true',
    productionActive:false
  },{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
