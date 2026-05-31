import { useState } from 'react';
import { Heart, Truck, Globe, Database, ExternalLink } from 'lucide-react';
import { useMockStore } from '@/lib/useMockStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import ProductImage from '@/components/ProductImage';
import { LinkThumb } from '@/components/LinkThumb';
interface ProductCardProps {
  product: {
    id: string;
    title?: string;
    price?: number;
    image?: string;
    rating?: number;
    source?: 'external' | 'marketplace';
    seller?: string | { name?: string; isMyPal?: boolean };
    url?: string | null;
    source_url?: string | null;
  };
  onClick?: () => void;
}

export const ProductCard = ({ product, onClick }: ProductCardProps) => {
  const { addToRecentViews } = useMockStore();
  const { isWishlisted: checkWishlisted, addItem, removeItem } = useWishlistStore();
  const [imageLoading, setImageLoading] = useState(true);

  const isWishlisted = checkWishlisted(product.id);
  const isInternal = product.source === 'marketplace';
  const sellerName = typeof product.seller === 'string' ? product.seller : product.seller?.name;
  const title = product.title ?? 'Product image';
  const linkUrl = product.url ?? product.source_url ?? null;
  // A web finding with no photo: show the link's favicon/domain instead of an empty box.
  const showLinkThumb = !product.image && !isInternal && !!linkUrl;

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWishlisted) {
      removeItem(product.id);
    } else {
      addItem({
        id: product.id,
        title: product.title ?? '',
        price: product.price ?? 0,
        image: product.image ?? '',
        source: product.source ?? 'marketplace',
      });
    }
  };

  const handleClick = () => {
    addToRecentViews(product.id);
    onClick?.();
  };

  return (
    <div 
      onClick={handleClick}
      className="glass-card overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-xl group"
    >
      {/* Image Container */}
      <div className="relative aspect-square bg-secondary">
        {showLinkThumb ? (
          <LinkThumb url={linkUrl!} label={sellerName} />
        ) : (
          <>
            {imageLoading && (
              <Skeleton className="absolute inset-0" />
            )}

            <ProductImage
              src={product.image}
              alt={title}
              width={600}
              height={600}
              className={cn(
                "w-full h-full object-cover transition-opacity duration-500 group-hover:scale-110",
                imageLoading ? "opacity-0" : "opacity-100"
              )}
              onLoad={() => setImageLoading(false)}
              onError={() => setImageLoading(false)}
            />
          </>
        )}
        
        {/* Wishlist Button */}
        <button
          onClick={handleWishlistToggle}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center transition-all hover:bg-background shadow-sm z-10"
        >
          <Heart 
            className={cn(
              "w-4 h-4 transition-colors",
              isWishlisted ? "fill-destructive text-destructive" : "text-foreground"
            )} 
          />
        </button>

        {/* Source Badge */}
        <div className="absolute bottom-2 left-2 flex gap-1.5">
          {isInternal ? (
            <span className="flex items-center gap-1 text-[10px] bg-cobalt-light text-white px-2 py-0.5 rounded-full font-bold shadow-lg">
              <Database className="w-3 h-3" /> Resident
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold shadow-lg">
              <Globe className="w-3 h-3" /> Web Agent
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground line-clamp-2 leading-snug group-hover:text-cobalt transition-colors">
            {title}
          </h3>
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {sellerName}
            {!isInternal && <ExternalLink className="w-2.5 h-2.5" />}
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <span className="text-lg font-black text-foreground">
              ${(product.price ?? 0).toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg
                    key={star}
                    className={cn(
                      "w-2.5 h-2.5",
                      star <= Math.floor(product.rating ?? 0)
                        ? "text-amber-400 fill-amber-400" 
                        : "text-slate-200 fill-slate-200"
                    )}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
          </div>
          
          {isInternal && (
            <div className="text-success flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-widest">
              <Truck className="w-3 h-3" /> Free
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ProductCardSkeleton = () => (
  <div className="glass-card overflow-hidden">
    <Skeleton className="aspect-square" />
    <div className="p-4 space-y-3">
      <div className="space-y-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  </div>
);

export default ProductCard;
