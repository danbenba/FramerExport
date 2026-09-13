import path from 'node:path';
import type { AssetMap } from '../assets/asset-map.js';
import { rewriteHtmlTags } from '../assets/html-tags.js';

export function injectRuntimeCms(
  html: string,
  assets: AssetMap,
  sourceBaseUrl: string,
  fromDir = ''
): string {
  const captured: Record<string, string> = {};
  for (const [url, entry] of assets.entries) {
    const source = new URL(url);
    if (
      source.protocol !== 'https:' ||
      source.hostname !== 'framerusercontent.com' ||
      source.username ||
      source.password ||
      !/^\/cms\/.+\.framercms$/i.test(source.pathname) ||
      !entry.localPath.endsWith('.framercms')
    )
      continue;
    let relative = path.posix.relative(fromDir || '.', entry.localPath);
    if (!relative.startsWith('.')) relative = './' + relative;
    captured[url] = relative;
  }
  if (!Object.keys(captured).length) return html;
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const script = `<script data-export-runtime-cms>(function(){
var assets=${json(captured)},base=${json(sourceBaseUrl)},nativeFetch=window.fetch;
if(!nativeFetch)return;
window.fetch=function(input,init){
try{
var request=input instanceof Request?input:null,method=init&&init.method!==undefined?init.method:request?request.method:'GET';
var headers=new Headers(init&&init.headers!==undefined?init.headers:request?request.headers:undefined);
var credentials=init&&init.credentials!==undefined?init.credentials:request?request.credentials:'same-origin';
if(String(method).toUpperCase()==='GET'&&credentials!=='include'&&!headers.has('authorization')&&!headers.has('proxy-authorization')&&!headers.has('range')&&!(init&&init.body)&&!(request&&request.body)){
var url=new URL(request?request.url:String(input),base);url.hash='';
if(Object.prototype.hasOwnProperty.call(assets,url.href)){
var target=new URL(assets[url.href],document.baseURI).href;
return nativeFetch.call(this,request?new Request(target,request):target,init);
}
}
}catch(_){}
return nativeFetch.call(this,input,init);
};
})();</script>`;
  let injected = false;
  html = rewriteHtmlTags(html, (tag, name) => {
    if (!injected && name === 'head') {
      injected = true;
      return tag + script;
    }
    return tag;
  });
  return injected ? html : script + html;
}
