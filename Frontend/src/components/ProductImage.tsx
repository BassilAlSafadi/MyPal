import { ImgHTMLAttributes, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { PRODUCT_IMAGE_FALLBACK, normalizeProductImageUrl } from '@/lib/productImage';

type ProductImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> & {
  src?: string | null;
  alt?: string | null;
  width?: number;
  height?: number;
  fallbackSrc?: string;
};

export const ProductImage = ({
  src,
  alt,
  width = 600,
  height = 600,
  fallbackSrc = PRODUCT_IMAGE_FALLBACK,
  className,
  onError,
  ...props
}: ProductImageProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const normalizedSrc = useMemo(
    () => normalizeProductImageUrl(src, { width, height, fallbackSrc }),
    [src, width, height, fallbackSrc],
  );
  const shouldUseFallback = failedSrc === normalizedSrc;
  const imageSrc = shouldUseFallback ? fallbackSrc : normalizedSrc;

  return (
    <img
      {...props}
      src={imageSrc}
      alt={alt?.trim() || 'Product image'}
      width={width}
      height={height}
      className={cn(!className && 'object-cover', className)}
      onError={(event) => {
        if (!shouldUseFallback) setFailedSrc(normalizedSrc);
        onError?.(event);
      }}
    />
  );
};

export default ProductImage;
