export const CFG = {
  viewport: { width: 1280, height: 900 },
  timeout: 60000,
  scrollStep: 200,
  scrollDelay: 100,
  concurrency: 6,
  retries: 2,
  dlTimeout: 15000,
  stripDomains: [
    'events.framer.com',
    'sentry.io',
    'api.framer.com',
    'stats.g.doubleclick.net',
    'google-analytics.com',
  ],
  stripSelectors: [
    'script[src*="events.framer.com"]',
    '#__framer-badge-container',
    '#__framer-badge',
  ],
};
