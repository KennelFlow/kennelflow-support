// Read-only environment readiness; never reveals credentials.
export async function onRequest({request,env={}}){
  if(request.method!=='GET')return new Response('Method not allowed',{status:405});
  return Response.json({
    ok:true,
    service:'Kennel One payments staging',
    squareCredentialsConfigured:!!(env.SQUARE_ACCESS_TOKEN&&env.SQUARE_LOCATION_ID),
    signatureVerificationConfigured:!!(env.SQUARE_WEBHOOK_SIGNATURE_KEY&&env.SQUARE_WEBHOOK_URL),
    neonSettlementConfigured:!!env.DATABASE_URL,
    yardPatrolDatabaseConfigured:!!env.YARDPATROL_DATABASE_URL,
    directCardPaymentsEnabled:env.ENABLE_DIRECT_CARD_PAYMENTS==='true',
    storeEmailConfigured:!!(env.RESEND_API_KEY&&env.ORDER_NOTIFICATION_EMAIL&&env.RESEND_FROM_EMAIL),
    storeSMSConfigured:!!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_FROM_NUMBER&&env.ORDER_NOTIFICATION_PHONE),
    eventStorageConfigured:!!env.EVENTS,
    settlementEnabled:env.ENABLE_ATOMIC_SERVICE_SETTLEMENT==='true',
    productionActive:false
  },{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
