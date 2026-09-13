import type { Page } from 'puppeteer';
import { log, warn } from '../logger/index.js';

type ImageAttributes = Record<'src' | 'srcset' | 'sizes', string | null>;

interface ResponsiveState {
  width: number;
  styles: Record<string, string>;
  nodes: Record<string, { id: number; identity: string }>;
  images: Record<string, ImageAttributes>;
  signature: string;
}

export async function captureResponsiveStyles(page: Page): Promise<string> {
  const originalViewport = page.viewport();
  if (!originalViewport) return '';
  log('Sampling responsive inline styles');
  await page.bringToFront();

  const nodeIds = await page.evaluateHandle(() => ({
    ids: new WeakMap<Element, number>(),
    next: 0,
  }));
  const states = new Map<number, ResponsiveState>();
  const sample = async (width: number): Promise<ResponsiveState> => {
    const existing = states.get(width);
    if (existing) return existing;
    log('Responsive viewport: ' + width + 'px');
    await page.setViewport({ ...originalViewport, width });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    const captured = await page.evaluate((identifiers) => {
      const helpers = {
        selector(element: Element): string {
          if (!element.parentElement) return element.localName;
          const siblings = Array.from(element.parentElement.children).filter(
            (sibling) => sibling.localName === element.localName
          );
          return (
            this.selector(element.parentElement) +
            ' > ' +
            element.localName +
            ':nth-of-type(' +
            (siblings.indexOf(element) + 1) +
            ')'
          );
        },
      };
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>('html, body, body *')
      ).filter(
        (element) =>
          element.style &&
          !['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE'].includes(element.tagName)
      );
      const styles: Record<string, string> = {};
      const nodes: Record<string, { id: number; identity: string }> = {};
      const images: Record<string, ImageAttributes> = {};
      for (const element of elements) {
        const selector = helpers.selector(element);
        if (!identifiers.ids.has(element)) identifiers.ids.set(element, ++identifiers.next);
        styles[selector] = element.style.cssText;
        if (element.tagName === 'IMG') {
          images[selector] = {
            src: element.getAttribute('src'),
            srcset: element.getAttribute('srcset'),
            sizes: element.getAttribute('sizes'),
          };
        }
        nodes[selector] = {
          id: identifiers.ids.get(element)!,
          identity: JSON.stringify([
            element.tagName,
            ['id', 'class', 'data-block-id', 'role', 'aria-label'].map((name) =>
              element.getAttribute(name)
            ),
            Array.from(element.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent)
              .join('')
              .trim(),
          ]),
        };
      }
      return { styles, nodes, images };
    }, nodeIds);
    const state = {
      width,
      ...captured,
      signature: JSON.stringify([captured.styles, captured.images]),
    };
    states.set(width, state);
    return state;
  };
  let baseline: ResponsiveState | undefined;
  let approximation = false;
  let failure: unknown;
  try {
    baseline = await sample(originalViewport.width);
    const widths = [
      ...new Set([320, 390, 480, 600, 768, 1024, 1280, 1440, originalViewport.width]),
    ].sort((a, b) => a - b);
    for (const width of widths) await sample(width);
    const intervals: Array<[ResponsiveState, ResponsiveState]> = widths
      .slice(1)
      .map((width, index) => [states.get(widths[index])!, states.get(width)!]);
    while (intervals.length) {
      const [left, right] = intervals.shift()!;
      if (left.signature === right.signature || right.width - left.width <= 1) continue;
      if (states.size >= 32) {
        approximation = true;
        continue;
      }
      const middle = await sample(Math.floor((left.width + right.width) / 2));
      intervals.push([left, middle], [middle, right]);
    }
  } catch (error) {
    failure = error;
  } finally {
    await page.setViewport(originalViewport);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    await nodeIds.dispose();
  }
  if (failure || !baseline) {
    warn('Responsive inline style capture incomplete: ' + (failure as Error)?.message);
    return '';
  }
  const original = baseline;
  const samples = [...states.values()].sort((a, b) => a.width - b.width);
  const originalIdentities = new Map<string, number>();
  for (const node of Object.values(original.nodes)) {
    originalIdentities.set(node.identity, (originalIdentities.get(node.identity) || 0) + 1);
  }

  const stylesAt = new Map<ResponsiveState, Record<string, string | undefined>>();
  const imagesAt = new Map<ResponsiveState, Record<string, ImageAttributes | undefined>>();
  for (const state of samples) {
    const byId = new Map(
      Object.entries(state.nodes).map(([selector, node]) => [node.id, selector])
    );
    const byIdentity = new Map<string, string[]>();
    for (const [selector, node] of Object.entries(state.nodes)) {
      byIdentity.set(node.identity, [...(byIdentity.get(node.identity) || []), selector]);
    }
    const resolvedStyles: Record<string, string | undefined> = {};
    const resolvedImages: Record<string, ImageAttributes | undefined> = {};
    for (const [selector, node] of Object.entries(original.nodes)) {
      let current = byId.get(node.id);
      let absent = false;
      if (current === undefined) {
        const matching = byIdentity.get(node.identity) || [];
        if (originalIdentities.get(node.identity) === 1) {
          if (matching.length === 1) current = matching[0];
          else if (matching.length === 0) absent = true;
        }
        if (!absent && current === undefined && state.nodes[selector]?.identity === node.identity)
          current = selector;
      }
      resolvedStyles[selector] =
        current !== undefined
          ? state.styles[current]
          : absent
            ? undefined
            : original.styles[selector];
      if (original.images[selector]) {
        resolvedImages[selector] =
          current !== undefined ? state.images[current] : original.images[selector];
      }
    }
    stylesAt.set(state, resolvedStyles);
    imagesAt.set(state, resolvedImages);
  }
  const changed = Object.keys(original.styles).filter((id) =>
    samples.some((state) => stylesAt.get(state)![id] !== original.styles[id])
  );
  const changedImages = Object.keys(original.images).filter((id) =>
    samples.some(
      (state) =>
        JSON.stringify(imagesAt.get(state)![id] ?? original.images[id]) !==
        JSON.stringify(original.images[id])
    )
  );
  if (!changed.length && !changedImages.length) return '';
  const groups: Array<{
    min: number;
    max?: number;
    styles: Record<string, string>;
    images: Record<string, ImageAttributes>;
    signature: string;
  }> = [];
  samples.forEach((state, index) => {
    const styles = Object.fromEntries(
      changed.map((id) => [
        id,
        stylesAt.get(state)![id] ?? original.styles[id] + ';display:none!important;',
      ])
    );
    const images = Object.fromEntries(
      changedImages.map((id) => [id, imagesAt.get(state)![id] ?? original.images[id]])
    );
    const signature = JSON.stringify([styles, images]);
    const previous = groups[groups.length - 1];
    if (previous?.signature === signature) return;
    const min = index ? Math.floor((samples[index - 1].width + state.width) / 2) + 1 : 0;
    if (previous) previous.max = min - 1;
    groups.push({ min, styles, images, signature });
  });
  if (approximation)
    warn(
      'Responsive styles or image sources vary continuously; saved measured viewport states within the 32-sample limit'
    );
  log(
    'Captured responsive inline styles: ' +
      changed.length +
      ' elements, ' +
      changedImages.length +
      ' image sources, ' +
      groups.length +
      ' ranges from ' +
      states.size +
      ' viewport samples'
  );
  return (
    (await page.evaluate((variants) => {
      const container = document.createElement('div');
      for (const variant of variants) {
        const template = document.createElement('template');
        template.setAttribute('data-export-responsive-state', '');
        template.setAttribute(
          'data-media',
          `(min-width: ${variant.min}px)` +
            (variant.max === undefined ? '' : ` and (max-width: ${variant.max}px)`)
        );
        for (const [id, cssText] of Object.entries(variant.styles)) {
          const value = document.createElement('i');
          value.setAttribute('data-export-responsive-target', id);
          value.setAttribute('style', cssText);
          template.content.append(value);
        }
        for (const [id, attributes] of Object.entries(variant.images)) {
          const value = template.content.ownerDocument.createElement('img');
          value.setAttribute('data-export-responsive-target', id);
          value.setAttribute('data-export-responsive-image', '');
          for (const [name, attribute] of Object.entries(attributes)) {
            if (attribute !== null) value.setAttribute(name, attribute);
          }
          template.content.append(value);
        }
        container.append(template);
      }
      return container.innerHTML;
    }, groups)) +
    `<script data-export-responsive-runtime>(function(){
    function install(){
      var variants=Array.from(document.querySelectorAll('template[data-export-responsive-state]'));
      function apply(){
        var state=variants.find(function(item){return window.matchMedia(item.getAttribute('data-media')).matches;});
        if(!state)return;
        state.content.querySelectorAll('i[data-export-responsive-target]').forEach(function(value){
          var element=document.querySelector(value.getAttribute('data-export-responsive-target'));
          if(element)element.setAttribute('style',value.getAttribute('style')||'');
        });
        state.content.querySelectorAll('[data-export-responsive-image]').forEach(function(value){
          var element=document.querySelector(value.getAttribute('data-export-responsive-target'));
          if(!element)return;
          ['src','srcset','sizes'].forEach(function(name){
            if(value.hasAttribute(name))element.setAttribute(name,value.getAttribute(name));
            else element.removeAttribute(name);
          });
        });
      }
      apply();window.addEventListener('resize',apply);
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  })();</script>`
  );
}
