import path from 'node:path';
import type { AssetMap } from '../assets/asset-map.js';

function stylesheetKey(value: string): string {
  const url = new URL(value);

  if (url.hostname === 'fonts.googleapis.com') url.protocol = 'https:';
  url.hash = '';
  return url.href;
}

function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function injectRuntimeStyles(
  html: string,
  assets: AssetMap,
  sourceBaseUrl: string,
  fromDir: string = ''
): string {
  const styles: Record<string, string> = {};
  for (const [url, { localPath }] of assets.entries) {
    if (!localPath.endsWith('.css') && !/text\/css/i.test(assets.contentTypes.get(url) ?? ''))
      continue;
    let relative = path.posix.relative(fromDir || '.', localPath);
    if (!relative.startsWith('.')) relative = './' + relative;
    styles[stylesheetKey(url)] = relative;
  }
  if (!Object.keys(styles).length) return html;
  const script = `<script data-export-runtime-styles>(function(){
var styles=${inlineJson(styles)},base=${inlineJson(sourceBaseUrl)};
function local(value){try{var url=new URL(String(value),base);if(url.hostname==='fonts.googleapis.com')url.protocol='https:';var hash=url.hash;url.hash='';return Object.prototype.hasOwnProperty.call(styles,url.href)?styles[url.href]+hash:value;}catch(_){return value;}}
try{var proto=HTMLLinkElement.prototype,href=Object.getOwnPropertyDescriptor(proto,'href'),set=proto.setAttribute;
if(href&&href.set)Object.defineProperty(proto,'href',{configurable:href.configurable,enumerable:href.enumerable,get:href.get,set:function(value){href.set.call(this,local(value));}});
Object.defineProperty(proto,'setAttribute',{configurable:true,writable:true,value:function(name,value){return set.call(this,name,String(name).toLowerCase()==='href'?local(value):value);}});
}catch(_){}
})();</script>`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (head) => head + script);
  return script + html;
}
