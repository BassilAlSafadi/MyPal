import { SearchResult } from '@/stores/searchStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { ExternalLink, Heart, Star, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  results: SearchResult[];
  aiSummary: string;
}

const SearchResults = ({ results, aiSummary }: Props) => {
  const { addItem, items, removeItem } = useWishlistStore();
  const external = results.filter((r) => r.source === 'external');
  const marketplace = results.filter((r) => r.source === 'marketplace');

  const isWishlisted = (id: string) => items.some((i) => i.id === id);

  const toggleWishlist = (r: SearchResult) => {
    if (isWishlisted(r.id)) {
      removeItem(r.id);
      toast('Removed from Wishlist');
    } else {
      addItem({
        title: r.title,
        price: r.price,
        image: r.image,
        source: r.source,
        url: r.url,
        priceHistory: [r.price],
        priceDrop: false,
      });
      toast('Added to Wishlist â™¥');
    }
  };

  return (
    <div className="px-4 space-y-4">
      {/* AI Summary */}
      <div className="glass-card p-4 space-y-2 border-cobalt/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cobalt-light" />
          <span className="text-xs font-semibold text-cobalt-light uppercase tracking-wider">AI Summary</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{aiSummary}</p>
      </div>

      {/* External Results */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-cobalt-light" /> External ({external.length})
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {external.map((r) => (
            <ResultCard key={r.id} result={r} wishlisted={isWishlisted(r.id)} onToggleWishlist={() => toggleWishlist(r)} />
          ))}
        </div>
      </div>

      {/* Marketplace */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Star className="w-4 h-4 text-warning" /> MyPal Marketplace ({marketplace.length})
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {marketplace.map((r) => (
            <ResultCard key={r.id} result={r} wishlisted={isWishlisted(r.id)} onToggleWishlist={() => toggleWishlist(r)} />
          ))}
        </div>
      </div>
    </div>
  );
};

const ResultCard = ({ result, wishlisted, onToggleWishlist }: { result: SearchResult; wishlisted: boolean; onToggleWishlist: () => void }) => (
  <div className="glass-card overflow-hidden group">
    <div className="relative">
      <img src={result.image} alt={result.title} className="w-full h-32 object-cover" />
      <button
        onClick={onToggleWishlist}
        className="absolute top-2 right-2 p-1.5 rounded-full bg-background/60 backdrop-blur-sm"
      >
        <Heart className={`w-3.5 h-3.5 ${wishlisted ? 'fill-destructive text-destructive' : 'text-foreground'}`} />
      </button>
      {result.source === 'external' && (
        <span className="absolute top-2 left-2 text-[10px] bg-cobalt/80 text-primary-foreground px-1.5 py-0.5 rounded">
          External
        </span>
      )}
    </div>
    <div className="p-3 space-y-1">
      <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">{result.title}</p>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-cobalt-light">${result.price}</span>
        <span className="text-[10px] text-muted-foreground">{result.seller}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <Star className="w-3 h-3 fill-warning text-warning" />
        <span className="text-[10px] text-muted-foreground">{result.rating}</span>
      </div>
    </div>
  </div>
);

export default SearchResults;
