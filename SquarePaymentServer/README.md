# KennelFlow Production Payment Server — Build 71

This server completes Square card and Apple Pay charges for KennelFlow. The Square access token must **never** be placed in the iOS app.

## Required server secrets
- `SQUARE_ACCESS_TOKEN` — Square Production access token
- `SQUARE_LOCATION_ID` — the Production Square location used by KennelFlow
- `SQUARE_ENVIRONMENT=production`

Optional:
- `MAX_PAYMENT_CENTS` — safety ceiling, default 5,000,000 cents ($50,000)
- `PORT` — defaults to 3000

## Endpoints
- `GET /health` — deployment health and environment
- `GET /square/config` — non-secret server configuration status
- `POST /square/create-payment` — completes a tokenized Square payment

A Dockerfile and `render.yaml` are included so this folder can be deployed as an HTTPS web service without putting Square secrets in Xcode.

After deployment, enter only the public HTTPS service URL, Square Production Application ID, and Production Location ID in KennelFlow Payment Setup. Do not enter the access token in KennelFlow.
