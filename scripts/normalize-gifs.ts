import { createHash } from 'node:crypto';
import type { Page } from 'puppeteer';

export interface GifPlacement {
  element: string;
  property: string;
  before: { x: number; y: number; width: number; height: number };
  after: { x: number; y: number; width: number; height: number };
}

export interface GifNormalization {
  url: string;
  sha256: string;
  bytes: number;
  frameCount: number;
  width: number;
  height: number;
  placements: GifPlacement[];
}

export async function freezeAnimatedGifs(
  page: Page,
  received: Map<string, Buffer>
): Promise<GifNormalization[]> {
  const resources = [...received].map(([url, buffer]) => ({
    url,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
    base64: buffer.toString('base64'),
  }));
  if (!resources.length) return [];

  return page.evaluate(`(async function () {
    if (typeof ImageDecoder !== 'function') throw new Error('GIF normalization requires ImageDecoder');
    const resources = ${JSON.stringify(resources)};
    const normalized = [];
    const replacements = new Map();
    for (const resource of resources) {
      const data = Uint8Array.from(atob(resource.base64), function (char) { return char.charCodeAt(0); });
      const decoder = new ImageDecoder({ data: data, type: 'image/gif' });
      await decoder.tracks.ready;
      await decoder.completed;
      const frameCount = decoder.tracks.selectedTrack.frameCount;
      if (frameCount <= 1) { decoder.close(); continue; }
      const result = await decoder.decode({ frameIndex: 0 });
      const frame = result.image;
      const canvas = document.createElement('canvas');
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
      canvas.getContext('2d').drawImage(frame, 0, 0);
      const png = canvas.toDataURL('image/png');
      frame.close();
      decoder.close();
      const entry = { url: resource.url, sha256: resource.sha256, bytes: resource.bytes,
        frameCount: frameCount, width: canvas.width, height: canvas.height, placements: [] };
      normalized.push(entry);
      replacements.set(resource.url, { png: png, entry: entry });
    }
    const observations = [];
    const rect = function (element) {
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };
    const observe = function (element, property, entry) {
      const placement = { element: element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') +
        (element.classList.length ? '.' + Array.from(element.classList).join('.') : ''),
        property: property, before: rect(element), after: null };
      entry.placements.push(placement);
      observations.push({ element: element, placement: placement });
    };
    const decoding = [];
    for (const img of document.images) {
      const replacement = replacements.get(img.currentSrc || img.src);
      if (!replacement) continue;
      observe(img, 'image', replacement.entry);
      if (img.parentElement && img.parentElement.tagName === 'PICTURE') {
        for (const source of img.parentElement.querySelectorAll('source')) source.srcset = replacement.png;
      }
      img.srcset = replacement.png;
      img.src = replacement.png;
      decoding.push(img.decode());
    }
    let id = 0;
    const rules = [];
    for (const element of document.querySelectorAll('*')) {
      for (const pseudo of ['', '::before', '::after']) {
        const original = getComputedStyle(element, pseudo || null).backgroundImage;
        if (!original || original === 'none') continue;
        const matched = new Set();
        const rewritten = original.replace(/url\\(\\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\\s*\\)/g,
          function (token, doubleQuoted, singleQuoted, unquoted) {
            const replacement = replacements.get((doubleQuoted || singleQuoted || unquoted || '').trim());
            if (!replacement) return token;
            matched.add(replacement.entry);
            return 'url("' + replacement.png + '")';
          });
        if (rewritten === original) continue;
        for (const entry of matched) observe(element, 'background-image' + pseudo, entry);
        if (!pseudo) element.style.setProperty('background-image', rewritten, 'important');
        else {
          const name = element.getAttribute('data-export-validation-gif') || 'gif-' + (++id);
          element.setAttribute('data-export-validation-gif', name);
          rules.push('[data-export-validation-gif="' + name + '"]' + pseudo + '{background-image:' + rewritten + '!important}');
        }
      }
    }
    if (rules.length) {
      const style = document.createElement('style'); style.textContent = rules.join('\\n'); document.head.append(style);
    }
    await Promise.all(decoding);
    await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
    for (const observation of observations) {
      const placement = observation.placement;
      placement.after = rect(observation.element);
      if (Object.keys(placement.before).some(function (key) { return Math.abs(placement.before[key] - placement.after[key]) > 0.01; })) {
        throw new Error('GIF normalization changed geometry: ' + placement.element);
      }
    }
    return normalized;
  })()`);
}
