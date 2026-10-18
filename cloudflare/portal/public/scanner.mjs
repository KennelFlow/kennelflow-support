const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
export function tagPayload(record){return record.externalQRPayload?.trim()||'kennelflow://smart/'+record.id.toUpperCase()}
export function attachScanner(host,onScan){
 let stream=null,timer=null,stopped=true,nfcAbort=null;
 const status=el('p'),video=el('video'),canvas=el('canvas'),start=el('button','Scan QR with camera'),stop=el('button','Stop scanning'),image=el('input'),label=el('label','Read QR from a photo');
 video.playsInline=true;video.muted=true;video.hidden=true;stop.hidden=true;start.type=stop.type='button';image.type='file';image.accept='image/*';label.append(image);canvas.hidden=true;
 const decode=async source=>{const {scanPixels}=await import('./scan-codecs.mjs');const width=source.videoWidth||source.naturalWidth,height=source.videoHeight||source.naturalHeight;if(!width||!height)return null;const ratio=Math.min(1,960/width,960/height);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0,canvas.width,canvas.height);return scanPixels(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height)};
 function halt(){stopped=true;clearTimeout(timer);stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;video.hidden=true;stop.hidden=true;start.disabled=false;host.dataset.scanning='false';nfcAbort?.abort();nfcAbort=null}
 const accept=value=>{if(!value)return;halt();status.textContent='Read: '+value;onScan(value)};
 start.onclick=async()=>{
  if(!navigator.mediaDevices?.getUserMedia){status.textContent='Camera scanning is unavailable in this browser. Choose a QR photo or paste its contents.';return}
  start.disabled=true;stopped=false;host.dataset.scanning='true';status.textContent='Allow camera access, then point at a QR code.';
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(stopped){stream.getTracks().forEach(t=>t.stop());return}video.srcObject=stream;video.hidden=false;stop.hidden=false;await video.play();
   const tick=async()=>{if(stopped)return;try{const value=await decode(video);if(value){accept(value);return}}catch(e){status.textContent='Could not read this frame. Keep the code in view.'}if(!stopped)timer=setTimeout(tick,150)};tick();
  }catch(e){halt();status.textContent='Camera not started: '+e.message+'. You can still choose a QR photo.'}
 };
 stop.onclick=()=>{halt();status.textContent='Scanning stopped.'};
 image.onchange=async()=>{const file=image.files?.[0];if(!file)return;if(file.size>10485760){status.textContent='Choose a photo smaller than 10 MB.';return}const url=URL.createObjectURL(file),picture=new Image();picture.onload=async()=>{try{const value=await decode(picture);if(value)accept(value);else status.textContent='No QR code found. Try a clearer photo.'}catch(e){status.textContent='Photo could not be read: '+e.message}finally{URL.revokeObjectURL(url)}};picture.onerror=()=>{URL.revokeObjectURL(url);status.textContent='Photo could not be opened.'};picture.src=url};
 const nfc=el('button','Scan NFC tag');nfc.type='button';nfc.onclick=async()=>{if(!window.NDEFReader){status.textContent='This browser cannot read NFC tags. Use the Kennel One iPhone app or supported Chrome on Android.';return}halt();nfcAbort=new AbortController();try{const reader=new window.NDEFReader();await reader.scan({signal:nfcAbort.signal});host.dataset.scanning='true';stop.hidden=false;status.textContent='Hold a programmed tag near the device.';reader.onreading=event=>{for(const record of event.message.records){if(['text','url'].includes(record.recordType)){accept(new TextDecoder(record.encoding||'utf-8').decode(record.data));break}}};reader.onreadingerror=()=>{status.textContent='Tag could not be read. Try holding it closer.'}}catch(e){halt();status.textContent='NFC scan was not started: '+e.message}};
 const visibility=()=>{if(document.hidden)halt()};document.addEventListener('visibilitychange',visibility);
 host.append(start,nfc,stop,video,label,canvas,status);
 return ()=>{halt();document.removeEventListener('visibilitychange',visibility)};
}
