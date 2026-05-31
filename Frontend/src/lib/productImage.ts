export const PRODUCT_IMAGE_FALLBACK = '/product-placeholder.svg';

type NormalizeProductImageOptions = {
  width?: number;
  height?: number;
  fallbackSrc?: string;
};

export function normalizeProductImageUrl(
  src: string | null | undefined,
  options: NormalizeProductImageOptions = {},
) {
  const fallbackSrc = options.fallbackSrc ?? PRODUCT_IMAGE_FALLBACK;
  const trimmed = src?.trim();

  if (!trimmed) return fallbackSrc;
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('data:image/')) return trimmed;

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return fallbackSrc;
    }

    if (url.hostname === 'images.unsplash.com') {
      url.protocol = 'https:';
      url.searchParams.set('auto', 'format');
      url.searchParams.set('fit', 'crop');
      url.searchParams.set('q', '80');

      if (options.width) url.searchParams.set('w', String(options.width));
      if (options.height) url.searchParams.set('h', String(options.height));
    }

    return url.toString();
  } catch {
    return fallbackSrc;
  }
}
