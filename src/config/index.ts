import type { Config } from '../types.js';

export const CFG: Config = {
  // Crawl at 2x so responsive images resolve to the retina variant the source
  // site serves; a 1x capture mirrors a softer image than the original.
  viewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  timeout: 90000,
  scrollStep: 250,
  scrollDelay: 60,
  concurrency: 12,
  retries: 3,
  dlTimeout: 30000,
  sharedStripDomains: [
    'sentry.io', 'www.googletagmanager.com', 'connect.facebook.net',
    'stats.g.doubleclick.net',
    'google-analytics.com',
  ],
};
