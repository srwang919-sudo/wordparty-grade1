// The web build fills these values with the exact files for this release.
const release = "0247fbb01818";
const essential = ["./assets/5aa6bac21c-entry-Bx7-XEDz.js", "./assets/5aa6bac21c-index-B8bp7qlN.css", "./manifest.webmanifest", "./pwa/icon-192.png", "./pwa/icon-512.png"];
const root = self.registration.scope;
const prefix = 'wordparty:' + new URL(root).pathname;
const shellName = prefix + ':shell:' + release;
const mediaName = prefix + ':recent';
const urlFor = path => new URL(path, root).href;
const absoluteShell = new Set(essential.map(urlFor));
const isAsset = href => {
  const url = new URL(href);
  return url.origin === self.location.origin &&
    (url.href.startsWith(urlFor('assets/')) || url.href.startsWith(urlFor('pwa/icon-')));
};
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(shellName);
    const response = await fetch(new Request(root,{cache:'reload'}));
    if(!response.ok || !(await response.clone().text()).includes(essential[0]))throw Error('New version being published');
    await shell.addAll(essential);
    await shell.put(root,response);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for(const name of await caches.keys()){
      if(name.startsWith(prefix+':shell:') && name!==shellName)await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
async function remember(cache,request,response){
  try{
    await cache.put(request,response);
    const entries=await cache.keys();
    if(entries.length>300)await Promise.all(entries.slice(0,entries.length-275).map(r=>cache.delete(r)));
  }catch{/* Storage pressure must not prevent online play. */}
}
async function readAsset(request,event){
  const shell=await caches.open(shellName);
  if(absoluteShell.has(request.url)){
    const existing=await shell.match(request);
    if(existing)return existing;
  }
  const media=await caches.open(mediaName);
  const cached=await media.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok)event.waitUntil(remember(media,request,response.clone()));
  return response;
}
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET'||request.headers.has('range'))return;
  const url=new URL(request.url);
  if(request.mode==='navigate' && [root,urlFor('index.html')].includes(url.origin+url.pathname)){
    event.respondWith((async()=>{
      try{const response=await fetch(request,{cache:'no-cache'});if(response.ok||response.status<500)return response;}
      catch{/* Use the last fully installed version for this scope. */}
      return (await (await caches.open(shellName)).match(root)) || Response.error();
    })());
  }else if(isAsset(request.url)){
    event.respondWith(readAsset(request,event));
  }
});
// The first page may fetch its cover and fonts before a worker controls it.
self.addEventListener('message', event => {
  if(event.data?.kind!=='first-page-assets'||!Array.isArray(event.data.urls))return;
  event.waitUntil((async()=>{
    const media=await caches.open(mediaName);
    const urls=[...new Set(event.data.urls)].filter(url=>typeof url==='string'&&isAsset(url)&&!absoluteShell.has(url)).slice(-40);
    await Promise.allSettled(urls.map(async url=>{
      if(await media.match(url))return;
      const response=await fetch(url,{cache:'force-cache'});
      if(response.ok)await remember(media,url,response);
    }));
  })());
});
