'use strict';
const $=id=>document.getElementById(id);
const video=$('video');
let current=null,demo=false;
function sourceUrl(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password)throw Error('请使用不含登录凭据的 HTTPS 视频文件地址。');
  return u.href;
}
function baseUrl(){const u=new URL(location.href);u.hash='';u.search='';return u;}
function previewUrl(data){
  const u=baseUrl(),p=new URLSearchParams({src:sourceUrl(data.src),title:(data.title||'分享的视频').slice(0,160)});
  if(data.expires)p.set('expires',data.expires);
  u.hash=p.toString();return u.href;
}
function formatTime(seconds){const n=Math.max(0,Math.round(seconds));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
function updateExpiry(){
  if(!current||demo)return;
  if(current.local){$('expires').textContent='当前设备本地预览';$('expiry-note').textContent='上传成功后会生成可分享的网页链接。';document.body.classList.remove('expired');return false;}
  const date=current.expires?new Date(current.expires):null;
  if(date&&Number.isFinite(date.getTime())){
    const left=date.getTime()-Date.now();
    $('expires').textContent=(left>0?'预计到期 ':'已到预计到期时间 ')+date.toLocaleString('zh-CN',{hour12:false});
    $('expiry-note').textContent=left>0?'约剩 '+(left>=3600000?(left/3600000).toFixed(1)+' 小时':Math.max(0,Math.floor(left/60000))+' 分钟')+' · 期限由存储服务提供。':'请让分享者重新生成视频链接。';
    document.body.classList.toggle('expired',left<=0);
    return left<=0;
  }
  $('expires').textContent='以视频存储服务的期限为准';$('expiry-note').textContent='预览网页不会延长视频文件的保存时间。';
  document.body.classList.remove('expired');return false;
}
function show(data,isDemo=false){
  video.pause();video.removeAttribute('src');video.load();
  current=data;demo=isDemo;document.body.classList.toggle('has-media',!isDemo);document.body.classList.toggle('shared-page',!isDemo&&!data.local&&!data.recordId);
  if(isDemo)video.setAttribute('poster','poster.jpg');else video.removeAttribute('poster');
  $('video-title').textContent=data.title||'分享的视频';document.title=$('video-title').textContent+' · ClipDock';
  $('kind-label').textContent=isDemo?'试播空间':data.local?'本地视频':'已分享的视频';$('type-label').textContent=isDemo?'合成演示':data.local?'本地预览':'网页预览';
  $('stage-idle').hidden=true;$('copy-status').textContent='';$('duration').textContent='—';
  $('play-status').textContent='正在读取视频…';
  $('copy-page').disabled=!!data.local;$('copy-source').disabled=!!data.local;
  $('page-url').value=data.local?'':isDemo?baseUrl().href+'#demo':previewUrl(data);
  $('source-url').value=data.local?'':data.src;
  if(isDemo){$('expires').textContent='演示长期可用';$('expiry-note').textContent='自制合成画面与音频，可用于体验播放。';document.body.classList.remove('expired');}
  else if(updateExpiry()){$('play-status').textContent='视频已到预计到期时间，请重新生成分享链接。';return;}
  video.src=data.src;video.load();
}
function loadHash(){
  try{
    if(location.hash==='#demo'){show({src:new URL('demo.mp4',baseUrl()).href,title:'一次轻量的视频分享 · 合成演示'},true);return;}
    const p=new URLSearchParams(location.hash.slice(1)),src=p.get('src');
    if(!src)return;
    const expires=p.get('expires')||'';
    if(expires&&!Number.isFinite(Date.parse(expires)))throw Error('分享链接中的到期时间格式有误。');
    show({src:sourceUrl(src),title:(p.get('title')||'分享的视频').slice(0,160),expires});
  }catch(e){document.body.classList.add('has-media');$('video-title').textContent='这个链接暂时无法预览';$('play-status').textContent=e.message;$('stage-idle').hidden=true;}
}
$('demo').onclick=()=>{if(location.hash!=='#demo')location.hash='demo';else show({src:new URL('demo.mp4',baseUrl()).href,title:'一次轻量的视频分享 · 合成演示'},true);$('viewer').scrollIntoView({behavior:'smooth',block:'start'});};
video.addEventListener('loadedmetadata',()=>{$('duration').textContent=Number.isFinite(video.duration)?formatTime(video.duration):'视频';$('play-status').textContent='可以播放 · 点击播放器开始观看';});
video.addEventListener('playing',()=>{$('play-status').textContent='正在播放';});
video.addEventListener('pause',()=>{if(video.readyState>=2&&!video.ended)$('play-status').textContent='已暂停';});
video.addEventListener('ended',()=>{$('play-status').textContent='播放结束';});
video.addEventListener('error',()=>{if(!current||!video.getAttribute('src'))return;$('play-status').textContent='视频暂时无法播放：源文件可能过期、当前网络无法访问，或编码不被浏览器支持。请让分享者重新生成链接。';});
async function copy(inputId,message){
  try{await navigator.clipboard.writeText($(inputId).value);$('copy-status').textContent=message;}
  catch(e){$('source-details').open=true;$(inputId).focus();$(inputId).select();$('copy-status').textContent='链接已选中，请按 Ctrl+C 或长按复制。';}
}
$('copy-page').onclick=()=>copy('page-url','已复制预览页。对方打开链接即可观看。');
$('copy-source').onclick=()=>copy('source-url','已复制视频源地址，可用于需要直接读取视频的工具。');
$('link-form').onsubmit=e=>{e.preventDefault();try{const data={src:sourceUrl($('input-url').value.trim()),title:$('input-title').value.trim()||'分享的视频'};const hash=new URL(previewUrl(data)).hash;if(location.hash===hash)show(data);else location.hash=hash;$('form-status').textContent='预览页已生成，可在播放器下方复制。';$('viewer').scrollIntoView({behavior:'smooth',block:'start'});}catch(error){$('form-status').textContent=error.message;}};
window.addEventListener('hashchange',loadHash);setInterval(updateExpiry,30000);loadHash();
for(const link of document.querySelectorAll('a[href="#about"],a[href="#link-form"],a[href="#uploads"]'))link.onclick=e=>{e.preventDefault();if(link.getAttribute('href')==='#uploads')document.body.classList.remove('shared-page');document.querySelector(link.getAttribute('href')).scrollIntoView({behavior:'smooth',block:'start'});};
