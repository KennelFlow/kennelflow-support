// Bundled locally; camera images and QR contents never leave the browser.
import QRCode from 'qrcode/lib/browser.js';
import jsQR from 'jsqr';
export const qrImage=text=>QRCode.toDataURL(text,{errorCorrectionLevel:'M',margin:4,width:600});
export const scanPixels=(data,width,height)=>jsQR(data,width,height,{inversionAttempts:'attemptBoth'})?.data||null;
