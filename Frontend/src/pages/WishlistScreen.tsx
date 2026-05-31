import { useEffect } from 'react';
import { useWishlistStore } from '@/stores/wishlistStore';
import { Heart, TrendingDown, ExternalLink, Trash2 } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import AIChatBubble from '@/components/AIChatBubble';
import ProductImage from '@/components/ProductImage';

const WishlistScreen = () => {
  const { items, removeItem, load } = useWishlistStore();

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-xl font-serif font-bold text-foreground flex items-center gap-2">
          <Heart className="w-5 h-5 text-destructive" /> Smart Wishlist
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Track prices across the globe</p>
      </div>

      {items.length === 0 ? (
        <div className="px-4 text-center py-16">
          <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Your wishlist is empty</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="glass-card p-3 flex gap-3">
              <ProductImage src={item.image} alt={item.title} width={160} height={160} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium text-foreground line-clamp-1">{item.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-cobalt-light">${item.price}</span>
                  {item.priceDrop && (
                    <span className="flex items-center gap-0.5 text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded-full">
                      <TrendingDown className="w-3 h-3" /> Price Drop!
                    </span>
                  )}
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">{item.source}</span>
                <div className="flex items-center gap-2 mt-1">
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-cobalt-light flex items-center gap-0.5">
                      <ExternalLink className="w-3 h-3" /> Visit
                    </a>
                  )}
                  <button onClick={() => removeItem(item.id)} className="text-[10px] text-destructive flex items-center gap-0.5">
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AIChatBubble />
      <BottomNav />
    </div>
  );
};

export default WishlistScreen;
