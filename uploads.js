'use strict';
// Each record has its own key. Saving a new upload never rewrites older records.
const MAX_UPLOAD_BYTES=200000000,SMALL_UPLOAD_BYTES=25000000;
const clips=new Map(),clipRows=new Map(),objectUrls=new Map(),requests=new Map();
let clipDb=null,activeUploads=0;
const localInput=$('local-files'),dropZone=$('drop-zone');
function storageWarning(){ $('storage-status').textContent='浏览器未能保存部分记录；请先复制已生成的链接。当前页面里的视频仍保留，关闭前请完成上传。'; }
function openClipDb(){
  return new Promise(resolve=>{
    try{
      const request=indexedDB.open('clipdock-library',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('clips',{keyPath:'id'});
      request.onsuccess=()=>{clipDb=request.result;clipDb.onversionchange=()=>{clipDb.close();clipDb=null;};resolve();};
      request.onerror=request.onblocked=()=>{storageWarning();resolve();};
    }catch(e){storageWarning();resolve();}
  });
}
function saveClip(clip){
  if(!clipDb){storageWarning();return;}
  try{
    const saved={...clip};
    // Large local-only videos stay in memory; completed uploads only need URLs.
    if(saved.src||saved.size>MAX_UPLOAD_BYTES)delete saved.file;
    const tx=clipDb.transaction('clips','readwrite');tx.objectStore('clips').put(saved);
    tx.onabort=tx.onerror=storageWarning;
  }catch(e){storageWarning();}
}
function readClips(){return new Promise(resolve=>{
  if(!clipDb){resolve([]);return;}
  try{const request=clipDb.transaction('clips').objectStore('clips').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>{storageWarning();resolve([]);};}catch(e){storageWarning();resolve([]);}
});}
function fileSize(size){return (size/1000000).toFixed(size<1000000?2:1)+' MB';}
function expiredClip(clip){return !!clip.expires&&Date.parse(clip.expires)<=Date.now();}
function clipStatus(clip){
  if(clip.state==='ready')return expiredClip(clip)?'已到预计到期时间 · 记录保留，可重新添加原视频':'链接已生成 · 到期 '+new Date(clip.expires).toLocaleString('zh-CN',{hour12:false});
  if(clip.state==='uploading')return clip.phase|| (clip.progress>=100?'正在生成分享链接…':'正在上传 '+clip.progress+'%');
  if(clip.state==='queued')return '等待上传';
  return clip.error||'尚未上传';
}
function makeButton(label,action){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=label;button.onclick=action;return button;}
function previewClip(clip){
  let src=clip.src,local=false;
  if(clip.file&&(!src||expiredClip(clip))){
    if(!objectUrls.has(clip.id))objectUrls.set(clip.id,URL.createObjectURL(clip.file));
    src=objectUrls.get(clip.id);local=true;
  }
  if(!src){clip.error='请重新选择原视频以恢复预览。';renderClip(clip);return;}
  show({src,title:clip.name,expires:local?'':clip.expires,local,recordId:clip.id});
  for(const [id,row] of clipRows)row.root.classList.toggle('selected',id===clip.id);
  $('viewer').scrollIntoView({behavior:'smooth',block:'start'});
}
async function copyClip(clip,source=false){
  const row=clipRows.get(clip.id),value=source?clip.src:previewUrl({src:clip.src,title:clip.name,expires:clip.expires});
  try{await navigator.clipboard.writeText(value);row.feedback.textContent=source?'已复制视频源地址。':'已复制预览页链接。';}
  catch(e){row.link.value=value;row.link.focus();row.link.select();row.feedback.textContent='链接已选中，请按 Ctrl+C 或长按复制。';}
}
function renderClip(clip){
  let row=clipRows.get(clip.id);
  if(!row){
    const root=document.createElement('article');root.className='clip-card';root.dataset.clipId=clip.id;
    const info=document.createElement('div');info.className='clip-info';
    const name=document.createElement('h4'),meta=document.createElement('p'),status=document.createElement('p');status.className='clip-status';
    info.append(name,meta,status);
    const progress=document.createElement('progress');progress.max=100;progress.setAttribute('aria-label','上传进度');
    const actions=document.createElement('div');actions.className='clip-actions';
    const preview=makeButton('预览',()=>previewClip(clip));
    const page=makeButton('复制预览页',()=>copyClip(clip));page.className='primary';
    const source=makeButton('复制视频源',()=>copyClip(clip,true));
    const retry=makeButton('重试上传',()=>{clip.state='queued';clip.error='';saveClip(clip);renderClip(clip);pumpUploads();});
    const cancel=makeButton('取消上传',()=>{
      clip.state='paused';clip.error='上传已取消 · 本地视频和其他记录均保留';
      if(requests.has(clip.id))requests.get(clip.id).abort();
      saveClip(clip);renderClip(clip);
    });
    actions.append(preview,page,source,retry,cancel);
    const link=document.createElement('input');link.readOnly=true;link.className='clip-link';link.setAttribute('aria-label',clip.name+'的预览页链接');
    const feedback=document.createElement('p');feedback.className='clip-feedback';feedback.setAttribute('role','status');
    root.append(info,progress,actions,link,feedback);$('upload-list').append(root);
    row={root,name,meta,status,progress,preview,page,source,retry,cancel,link,feedback};clipRows.set(clip.id,row);
  }
  row.name.textContent=clip.name;
  row.meta.textContent=fileSize(clip.size)+' · '+new Date(clip.created).toLocaleString('zh-CN',{hour12:false});
  row.status.textContent=clipStatus(clip);row.root.dataset.state=expiredClip(clip)?'expired':clip.state;
  row.progress.hidden=clip.state!=='uploading';row.progress.value=clip.progress||0;
  row.preview.disabled=!clip.file&&!clip.src;
  const ready=clip.state==='ready';row.page.hidden=row.source.hidden=row.link.hidden=!ready;
  row.page.disabled=row.source.disabled=expiredClip(clip);
  if(ready)row.link.value=previewUrl({src:clip.src,title:clip.name,expires:clip.expires});
  row.retry.hidden=!['error','paused'].includes(clip.state)||!clip.file||clip.size>MAX_UPLOAD_BYTES;
  row.cancel.hidden=!['queued','uploading'].includes(clip.state);
  $('upload-count').textContent=clips.size;$('upload-empty').hidden=clips.size>0;
}
function uploadSmallFile(clip){return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();requests.set(clip.id,xhr);
  xhr.open('POST','https://tdrop.link/upload');xhr.timeout=300000;xhr.responseType='json';
  xhr.upload.onprogress=e=>{if(e.lengthComputable){clip.progress=Math.min(100,Math.round(e.loaded/e.total*100));renderClip(clip);}};
  xhr.onerror=()=>reject(Error('网络或上传服务暂时不可用，请稍后重试。'));
  xhr.ontimeout=()=>reject(Error('上传超时，请检查网络后重试。'));
  xhr.onabort=()=>reject(Error('上传已取消'));
  xhr.onload=()=>{
    const data=xhr.response;
    if(xhr.status<200||xhr.status>=300||!data||!data.success){reject(Error(xhr.status===413?'文件超过服务大小限制。':xhr.status===429?'上传服务限流，请稍后重试。':'上传失败（HTTP '+xhr.status+'），请稍后重试。'));return;}
    try{
      if(!/^[A-Za-z0-9]+$/.test(data.code))throw Error('上传服务未返回有效的视频编号。');
      const expires=data.expiresAt;if(!expires||!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now())throw Error('上传服务未返回有效的保存期限。');
      resolve({src:'https://tdrop.link/'+data.code+'/'+encodeURIComponent(data.filename||clip.uploadName)+'?download=1',expires});
    }catch(e){reject(e);}
  };
  // Let the browser set its own multipart boundary; never send cookies or secrets.
  const form=new FormData();form.append('file',clip.file,clip.uploadName);form.append('ttl','24h');xhr.send(form);
});}
function ensureRunning(clip){if(clip.state!=='uploading')throw Error('上传已取消');}
const LARGE_STORAGE='https://clipdock-storage-200.mintyvine25.chatgpt.site';
async function storageJson(clip,path,options={}){
  ensureRunning(clip);const controller=new AbortController();requests.set(clip.id,controller);
  const timeout=setTimeout(()=>controller.abort(),120000);
  try{
    const response=await fetch(LARGE_STORAGE+path,{...options,credentials:'omit',signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'大文件服务失败（HTTP '+response.status+'），请稍后重试。');
    ensureRunning(clip);return data;
  }finally{clearTimeout(timeout);}
}
async function uploadLargeFile(clip){
  if(!clip.uploadSession||clip.uploadSession.provider!=='clipdock'){
    clip.phase='正在申请大文件上传地址…';renderClip(clip);
    const session=await storageJson(clip,'/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({size:clip.size,extension:clip.uploadName.split('.').pop()})});
    if(!/^[a-f0-9]{32}$/.test(session.id)||!session.token||!Number.isSafeInteger(session.partBytes)||session.partBytes<1||session.partBytes>16*1024*1024)throw Error('存储服务未返回完整的上传信息。');
    clip.uploadSession={...session,provider:'clipdock',completedParts:0};saveClip(clip);
  }
  const session=clip.uploadSession;
  const count=Math.ceil(clip.size/session.partBytes);
  for(let index=session.completedParts;index<count;index++){
    ensureRunning(clip);const start=index*session.partBytes,end=Math.min(clip.size,start+session.partBytes);
    clip.phase='';clip.progress=Math.floor(start/clip.size*100);renderClip(clip);
    await new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();requests.set(clip.id,xhr);xhr.open('PUT',LARGE_STORAGE+'/uploads/'+session.id+'/parts/'+(index+1));xhr.timeout=180000;xhr.responseType='json';xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('Authorization','Bearer '+session.token);
      xhr.upload.onprogress=e=>{if(e.lengthComputable){clip.progress=Math.min(100,Math.floor((start+e.loaded/e.total*(end-start))/clip.size*100));renderClip(clip);}};
      xhr.onerror=()=>reject(Error('大文件上传中断，请检查网络后重试。'));
      xhr.ontimeout=()=>reject(Error('大文件上传超时，请重试。'));
      xhr.onabort=()=>reject(Error('上传已取消'));
      xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)resolve();else{if([403,404,410].includes(xhr.status))delete clip.uploadSession;reject(Error(xhr.response?.error||'视频传输失败（HTTP '+xhr.status+'），请重试。'));}};
      xhr.send(clip.file.slice(start,end));
    });
    session.completedParts=index+1;saveClip(clip);
  }
  clip.phase='正在核对完整文件并生成链接…';renderClip(clip);
  const result=await storageJson(clip,'/uploads/'+session.id+'/complete',{method:'POST',headers:{Authorization:'Bearer '+session.token}});
  const media=new URL(result.src);if(media.origin!==LARGE_STORAGE||result.size!==clip.size||!Number.isFinite(Date.parse(result.expires)))throw Error('视频核对信息异常，请重试。');
  delete clip.uploadSession;clip.phase='';
  return {src:media.href,expires:result.expires};
}
function uploadFile(clip){return clip.size>SMALL_UPLOAD_BYTES?uploadLargeFile(clip):uploadSmallFile(clip);}
function pumpUploads(){
  while(activeUploads<2){
    const largeActive=Array.from(clips.values()).some(item=>item.state==='uploading'&&item.size>SMALL_UPLOAD_BYTES);
    const clip=Array.from(clips.values()).find(item=>item.state==='queued'&&(!largeActive||item.size<=SMALL_UPLOAD_BYTES));if(!clip)break;
    activeUploads++;clip.state='uploading';clip.progress=0;clip.phase='';saveClip(clip);renderClip(clip);
    uploadFile(clip).then(result=>{
      Object.assign(clip,result,{state:'ready',error:''});
      if(current&&current.recordId===clip.id)show({src:clip.src,title:clip.name,expires:clip.expires,recordId:clip.id});
      if(objectUrls.has(clip.id)){URL.revokeObjectURL(objectUrls.get(clip.id));objectUrls.delete(clip.id);}
      delete clip.file;
    }).catch(error=>{if(clip.state!=='paused'){clip.state='error';clip.error=error.message;}}).finally(()=>{
      requests.delete(clip.id);activeUploads--;saveClip(clip);renderClip(clip);pumpUploads();
    });
  }
  const waiting=Array.from(clips.values()).filter(clip=>clip.state==='queued').length;
  $('queue-status').textContent=activeUploads||waiting?'上传中 '+activeUploads+' · 等待 '+waiting:'可继续添加视频';
}
async function addFiles(files){
  await libraryReady;
  let first=null,rejected=0;
  for(const file of files){
    if(!(file.type.startsWith('video/')||/\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(file.name))||!file.size){rejected++;continue;}
    const extension=(file.name.match(/\.([a-z0-9]+)$/i)||[])[1]||'mp4';
    const clip={id:crypto.randomUUID(),name:file.name.slice(0,200),size:file.size,created:new Date().toISOString(),file,uploadName:'video.'+extension.toLowerCase(),state:file.size>MAX_UPLOAD_BYTES?'local':'queued',error:file.size>MAX_UPLOAD_BYTES?'超过 200 MB · 可本地预览，分享请先压缩或截取片段':'',progress:0};
    clips.set(clip.id,clip);saveClip(clip);renderClip(clip);if(!first)first=clip;
  }
  if(rejected)$('upload-feedback').textContent='已跳过 '+rejected+' 个空文件或非视频文件；有效视频已追加到列表。';
  if(first&&(!current||demo))previewClip(first);
  localInput.value='';pumpUploads();
}
$('choose-files').onclick=()=>localInput.click();localInput.onchange=()=>addFiles(Array.from(localInput.files));
let dragDepth=0;
// Prevent a file dropped elsewhere from navigating away and losing the queue.
window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
window.addEventListener('drop',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
dropZone.addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;dropZone.classList.add('drag-over');});
dropZone.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;dropZone.classList.remove('drag-over');}});
dropZone.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
dropZone.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;dropZone.classList.remove('drag-over');addFiles(Array.from(e.dataTransfer.files));});
window.addEventListener('beforeunload',e=>{if(activeUploads||Array.from(clips.values()).some(clip=>clip.state==='queued')){e.preventDefault();e.returnValue='';}});
const libraryReady=(async()=>{
  await openClipDb();const saved=await readClips();
  for(const clip of saved.sort((a,b)=>a.created.localeCompare(b.created))){
    if(['queued','uploading'].includes(clip.state)){clip.state='paused';clip.error='上次上传中断 · 点击重试继续';}
    if(clip.state==='local'&&!clip.file)clip.error='本地预览未跨刷新保存 · 请重新选择原视频';
    clips.set(clip.id,clip);renderClip(clip);
  }
})();
setInterval(()=>{for(const clip of clips.values())if(clip.state==='ready')renderClip(clip);},30000);
