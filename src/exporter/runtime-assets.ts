import path from 'node:path';
import type { AssetMap } from '../assets/asset-map.js';
import { rewriteHtmlTags } from '../assets/html-tags.js';

export function injectRuntimeAssets(
  html: string,
  assets: AssetMap,
  sourceBaseUrl: string,
  fromDir = ''
): string {
  const captured: Record<string, string> = {};
  for (const [url, entry] of assets.entries) {
    if (!/\.(?:m?js|png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|ogg|mp3|wav)$/i.test(entry.localPath))
      continue;
    let relative = path.posix.relative(fromDir || '.', entry.localPath);
    if (!relative.startsWith('.')) relative = './' + relative;
    captured[url] = relative;
  }
  if (!Object.keys(captured).length) return html;
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const script = `<script data-export-runtime-assets>(function(){
var assets=${json(captured)},base=${json(sourceBaseUrl)};
function local(value){try{var url=new URL(String(value),base),hash=url.hash;url.hash='';return Object.prototype.hasOwnProperty.call(assets,url.href)?assets[url.href]+hash:value;}catch(_){return value;}}
function srcset(value){var text=String(value),out='',i=0;while(i<text.length){var lead=i;while(i<text.length&&/[\\s,]/.test(text[i]))i++;out+=text.slice(lead,i);var start=i;while(i<text.length&&!/\\s/.test(text[i]))i++;var end=i;while(end>start&&text[end-1]===',')end--;if(end>start)out+=local(text.slice(start,end));out+=text.slice(end,i);if(end!==i)continue;var descriptors=i,depth=0;while(i<text.length){var c=text[i++];if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0)break;}out+=text.slice(descriptors,i);}return out;}
function install(proto,properties){if(!proto)return;var nativeSet=proto.setAttribute;properties.forEach(function(name){var descriptor=Object.getOwnPropertyDescriptor(proto,name);if(!descriptor||!descriptor.set)return;Object.defineProperty(proto,name,{configurable:descriptor.configurable,enumerable:descriptor.enumerable,get:descriptor.get,set:function(value){descriptor.set.call(this,name==='srcset'?srcset(value):local(value));}});});Object.defineProperty(proto,'setAttribute',{configurable:true,writable:true,value:function(name,value){var key=String(name).toLowerCase();return nativeSet.call(this,name,properties.indexOf(key)!==-1?(key==='srcset'?srcset(value):local(value)):value);}});}
try{install(HTMLImageElement.prototype,['src','srcset']);install(HTMLScriptElement.prototype,['src']);install(HTMLSourceElement.prototype,['src','srcset']);install(HTMLMediaElement.prototype,['src']);install(HTMLVideoElement.prototype,['poster']);}catch(_){}
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
