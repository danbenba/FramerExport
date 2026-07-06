export type { PlatformHandler, PlatformType, PlatformCategory, ScrollStrategy } from './types.js';
export { framer } from './framer.js';
export { webflow } from './webflow.js';
export { wix } from './wix.js';
export {
  PLATFORM_REGISTRY,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  sortedByPriority,
  platformsByCategory,
} from './registry.js';
export {
  detectPlatform,
  detectByUrl,
  detectByHtml,
  detectByGenerator,
  detectByDom,
  readGenerator,
  getPlatformByName,
} from './detect.js';
