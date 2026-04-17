export type PlatformType = 'framer' | 'webflow' | 'wix' | 'unknown';

export interface PlatformHandler {
  name: PlatformType;
  displayName: string;
  detectByUrl(url: string): boolean;
  detectByHtml(html: string): boolean;
  stripDomains: string[];
  stripSelectors: string[];
  stripPatterns: RegExp[];
  hydrationTimeout: number;
  needsHydrationCheck: boolean;
  mapAssetDir(host: string, pathname: string, ext: string): string | null;
}
