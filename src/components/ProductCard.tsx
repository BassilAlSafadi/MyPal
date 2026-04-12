import { useState } from 'react';
import { Heart, Camera, Truck, ShieldCheck, FileText } from 'lucide-react';
import { useMockStore } from '@/lib/useMockStore';
import type { Product } from '@/mock/products';
import { getTrustBadgeConfig } from '@/mock/user';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  onClick?: () => void;
}

export const ProductCard = ({ product, onClick }: ProductCardProps) => {
  const { wishlist, addToWishlist, removeFromWishlist, addToRecentViews } = useMockStore();
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  
  const isWishlisted = wishlist.includes(product.id);
  
  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWishlisted) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist(product.id);
    }
  };

  const handleClick = () => {
    addToRecentViews(product.id);
    onClick?.();
  };

  const trustBadge = product.seller.isMyPal && product.seller.trustTier 
    ? getTrustBadgeConfig(product.seller.trustTier) 
    : null;

  return (
    <div 
      onClick={handleClick}
      className="glass-card overflow-hidden cursor-pointer transition-transform duration-200 hover:scale-[1.02]"
    >
      {/* Image Container */}
      <div className="relative aspect-square bg-secondary">
        {imageLoading && (
          <Skeleton className="absolute inset-0" />
        )}
        
        {imageError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-secondary text-muted-foreground">
            <Camera className="w-8 h-8 mb-1" />
            <span className="text-xs font-medium">
              {product.title.slice(0, 2).toUpperCase()}
            </span>
          </div>
        ) : (
          <img
            src={product.image}
            alt={product.title}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-300",
              imageLoading ? "opacity-0" : "opacity-100"
            )}
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageError(true);
              setImageLoading(false);
            }}
          />
        )}
        
        {/* Wishlist Button */}
        <button
          onClick={handleWishlistToggle}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center transition-colors hover:bg-background"
        >
          <Heart 
            className={cn(
              "w-4 h-4 transition-colors",
              isWishlisted ? "fill-destructive text-destructive" : "text-foreground"
            )} 
          />
        </button>

        {/* Source Badge */}
        <div className="absolute bottom-2 left-2">
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-medium",
            product.seller.isMyPal 
              ? "bg-cobalt-light/20 text-cobalt-light" 
              : "bg-secondary text-muted-foreground"
          )}>
            {product.seller.isMyPal ? 'MyPal' : 'External'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Title */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-tight flex-1">
            {product.title}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSummary(!showSummary);
              // TODO: Trigger AI summary here
            }}
            className="flex-shrink-0 p-1 rounded-md hover:bg-secondary transition-colors"
            title="Summarize description"
          >
            <FileText className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>

        {/* Description Summary */}
        {showSummary && (
          <p className="text-xs text-muted-foreground line-clamp-3">
            {product.description || 'No description available.'}
          </p>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-foreground">
            ${product.price.toLocaleString()}
          </span>
          {product.originalPrice && (
            <span className="text-xs text-muted-foreground line-through">
              ${product.originalPrice.toLocaleString()}
            </span>
          )}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1">
          <div className="flex">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                className={cn(
                  "w-3 h-3",
                  star <= Math.floor(product.rating) 
                    ? "text-warning fill-warning" 
                    : "text-muted-foreground"
                )}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">
            ({product.reviewCount.toLocaleString()})
          </span>
        </div>

        {/* Seller & Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {product.seller.name}
          </span>
          
          {trustBadge && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              trustBadge.color
            )}>
              {trustBadge.label}
            </span>
          )}
          
          {product.freeShipping && (
            <span className="text-[10px] text-success flex items-center gap-0.5">
              <Truck className="w-3 h-3" /> Free
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const ProductCardSkeleton = () => (
  <div className="glass-card overflow-hidden">
    <Skeleton className="aspect-square" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
);

export default ProductCard;
