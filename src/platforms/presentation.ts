import type { PlatformType } from './types.js';
import { PROVIDER_ICONS } from './provider-icons.generated.js';

export type ProviderId = Exclude<PlatformType, 'unknown'> | 'auto';

export interface ProviderPresentation {
  readonly name: string;
  readonly description: string;
  readonly homepage: string;
  readonly color: string;
  readonly iconBackground: '#EEEEEE' | 'transparent';
  readonly iconDataUri: string;
  readonly iconRgba: {
    readonly width: 256;
    readonly height: 256;
    readonly deflateBase64: string;
  };
  readonly iconPixels: {
    readonly width: 16;
    readonly height: 16;
    readonly rgbaBase64: string;
  };
  readonly sourceUrl: string;
  readonly licenseUrl: string | null;
}

export const PROVIDER_PRESENTATION: Readonly<Record<ProviderId, ProviderPresentation>> =
  PROVIDER_ICONS;

export function providerPresentation(id: string): ProviderPresentation {
  return Object.hasOwn(PROVIDER_PRESENTATION, id)
    ? PROVIDER_PRESENTATION[id as ProviderId]
    : PROVIDER_PRESENTATION.auto;
}
