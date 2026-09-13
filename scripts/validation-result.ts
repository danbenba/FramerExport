export interface ValidationPage {
  kind: string;
  status?: number;
  metrics: { bodyTextLength: number; brokenImages: string[] };
  failed: string[];
  external: Array<{ type: string; url: string }>;
  errors: string[];
  networkFailures: string[];
  readinessFailures?: string[];
  readinessNotes?: string[];
}

export function assessViewport(
  viewportRatio: number,
  fullPageRatio: number,
  pages: ValidationPage[],
  threshold = 0.005
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!Number.isFinite(viewportRatio) || viewportRatio > threshold)
    reasons.push('Viewport pixel difference exceeds threshold');
  if (!Number.isFinite(fullPageRatio) || fullPageRatio > threshold)
    reasons.push('Full-page pixel difference exceeds threshold');
  for (const kind of ['source', 'export']) {
    const page = pages.find((entry) => entry.kind === kind);
    if (!page) {
      reasons.push('Missing ' + kind + ' capture');
      continue;
    }
    if (!page.status || page.status >= 400)
      reasons.push(kind + ' page did not return a successful response');
    if (!page.metrics.bodyTextLength)
      reasons.push(kind + ' page has no visible text; manual validation required');
    if (page.metrics.brokenImages.length) reasons.push(kind + ' page contains broken images');
    if (page.errors.length) reasons.push(kind + ' page raised JavaScript errors');
    if (page.readinessFailures?.length)
      reasons.push(kind + ' page did not finish loading before measurement');
    if (kind === 'export') {
      if (page.failed.length) reasons.push('Export has failed HTTP responses');
      if (page.networkFailures.length) reasons.push('Export has failed network requests');
      if (page.external.length) reasons.push('Export still requests external resources');
    }
  }
  return { passed: reasons.length === 0, reasons };
}
