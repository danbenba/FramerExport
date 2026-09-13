import type { Page } from 'puppeteer';

export async function capturePageHtml(page: Page, sourceHtml?: string): Promise<string> {
  return page.evaluate((source) => {
    const selector = 'style, link[rel~="stylesheet"]';
    const root = source
      ? new DOMParser().parseFromString(source, 'text/html').documentElement
      : (document.documentElement.cloneNode(true) as HTMLElement);
    const liveNodes = Array.from(
      document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(selector)
    );
    const targetNodes = Array.from(
      root.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(selector)
    );
    const used = new Set<Element>();
    const helpers = {
      absoluteHref(node: Element): string {
        try {
          return new URL(node.getAttribute('href') || '', document.baseURI).href;
        } catch {
          return node.getAttribute('href') || '';
        }
      },
      attributes(node: Element): string {
        return Array.from(node.attributes)
          .filter((attr) => attr.name !== 'nonce')
          .map((attr) => `${attr.name}=${attr.value}`)
          .sort()
          .join('\n');
      },
    };
    const matches = liveNodes.map((node, index) => {
      if (!source) return targetNodes[index];
      const available = targetNodes.filter(
        (target) => !used.has(target) && target.tagName === node.tagName
      );
      const target = node.id
        ? available.find((candidate) => candidate.id === node.id)
        : node.tagName === 'LINK'
          ? available.find(
              (candidate) => helpers.absoluteHref(candidate) === helpers.absoluteHref(node)
            )
          : available.find(
              (candidate) =>
                helpers.attributes(candidate) === helpers.attributes(node) &&
                candidate.textContent === node.textContent
            ) ||
            available.find(
              (candidate) => helpers.attributes(candidate) === helpers.attributes(node)
            );
      if (target) used.add(target);
      return target;
    });
    let previous: Element | undefined;
    liveNodes.forEach((node, index) => {
      let target = matches[index];
      if (!target) {
        target = node.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;

        const next = matches.slice(index + 1).find((candidate) => candidate?.parentNode);
        if (next) next.before(target);
        else if (previous) previous.after(target);
        else (root.querySelector('head') || root).append(target);
      }
      previous = target;
      if (node.tagName === 'LINK') {
        target.setAttribute('href', helpers.absoluteHref(node));
        if (node.sheet?.disabled) target.setAttribute('media', 'not all');
        return;
      }
      try {
        if (node.sheet) {
          target.textContent = Array.from(node.sheet.cssRules, (rule) => rule.cssText)
            .join('\n')
            .replace(/<\/style/gi, '<\\/style');
          if (node.sheet.disabled) target.setAttribute('media', 'not all');
        }
      } catch {}
    });

    for (const [index, sheet] of Array.from(document.adoptedStyleSheets || []).entries()) {
      try {
        const style = document.createElement('style');
        style.setAttribute('data-export-adopted-stylesheet', String(index));
        style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText)
          .join('\n')
          .replace(/<\/style/gi, '<\\/style');
        if (sheet.disabled) style.media = 'not all';
        else if (sheet.media.mediaText) style.media = sheet.media.mediaText;
        (root.querySelector('body') || root).append(style);
      } catch {}
    }
    const doctype = source
      ? source.match(/<!doctype[^>]*>/i)?.[0] || '<!DOCTYPE html>'
      : document.doctype
        ? new XMLSerializer().serializeToString(document.doctype)
        : '<!DOCTYPE html>';
    return doctype + '\n' + root.outerHTML;
  }, sourceHtml);
}

export async function waitForFonts(page: Page, timeout = 5000): Promise<void> {
  await page.evaluate(
    (limit) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, limit);
        document.fonts.ready.then(
          () => {
            clearTimeout(timer);
            resolve();
          },
          () => {
            clearTimeout(timer);
            resolve();
          }
        );
      }),
    timeout
  );
}
