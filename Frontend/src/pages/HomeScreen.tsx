import { useNavigate } from 'react-router-dom';
import { useMockStore } from '@/lib/useMockStore';
import { productService } from '@/services/productService';
import { walletService } from '@/services/walletService';
import { searchService } from '@/services/searchService';
import { useAsync } from '@/hooks/useAsync';
import { 
  Search, Sparkles, TrendingUp, ChevronRight, ArrowRight,
  Smartphone, Shirt, Home, Dumbbell, BookOpen, Car, Palette, Briefcase,
  Clock, Package, Globe, Database, Terminal, Loader2, Star, Tag
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import ProductCard from '@/components/ProductCard';
import { ProductPreviewDrawer, ProductPreview } from '@/components/ProductPreviewDrawer';
import LogoIcon from '@/components/LogoIcon';
import { useState, useEffect, useRef } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { cn } from '@/lib/utils';
import { PRODUCT_IMAGE_FALLBACK } from '@/lib/productImage';
import { useMemo } from 'react';

const categories = [
  { name: 'Electronics', icon: Smartphone, color: 'bg-blue-500/10 text-blue-500' },
  { name: 'Fashion', icon: Shirt, color: 'bg-pink-500/10 text-pink-500' },
  { name: 'Home & Garden', icon: Home, color: 'bg-green-500/10 text-green-500' },
  { name: 'Sports & Outdoors', icon: Dumbbell, color: 'bg-orange-500/10 text-orange-500' },
  { name: 'Books & Media', icon: BookOpen, color: 'bg-purple-500/10 text-purple-500' },
  { name: 'Vehicles & Parts', icon: Car, color: 'bg-red-500/10 text-red-500' },
  { name: 'Collectibles & Art', icon: Palette, color: 'bg-amber-500/10 text-amber-500' },
  { name: 'Services', icon: Briefcase, color: 'bg-cyan-500/10 text-cyan-500' },
];

const HomeScreen = () => {
  const navigate = useNavigate();
  const { recentViews } = useMockStore();
  const { mode, setMode, runSearch, isSearching, consoleLogs } = useSearchStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductPreview | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadWishlist = useWishlistStore((s) => s.load);
  const { data: catalog } = useAsync(() => productService.list({ pageSize: 24 }), []);
  const { data: wallet } = useAsync(() => walletService.getBalance(), []);
  // Personalized recommendations — refreshed every time the user visits Home
  const { data: recData, loading: recLoading, refetch: refetchRecs } =
    useAsync(() => searchService.getPersonalizedRecommendations(), []);
  const products = catalog?.products ?? [];
  const balance  = wallet?.balance ?? 0;

  useEffect(() => { loadWishlist(); }, [loadWishlist]);

  // Refresh recommendations when the tab regains focus (user comes back from AI search)
  useEffect(() => {
    const onFocus = () => refetchRecs();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetchRecs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      runSearch(searchQuery.trim());
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/search');
    }
  };

  const trendingProducts = useMemo(() => {
    return [...products].sort((a, b) => b.rating - a.rating).slice(0, 6);
  }, [products]);

  // Real personalized recommendations from the AI engine.
  // Falls back to newest products while loading or on error.
  const recommendedProducts = useMemo(() => {
    if (recData?.products?.length) {
      return recData.products.map((r) => ({
        id:       r.id,
        title:    r.title,
        price:    r.price ?? 0,
        image:    r.image ?? '',
        rating:   0,
        reviewCount: 0,
        category: r.category,
        source:   'marketplace' as const,
        seller:   { name: 'MyPal', isMyPal: true },
      }));
    }
    return products.slice(0, 4);
  }, [recData, products]);

  const recentlyViewedProducts = useMemo(() => {
    return recentViews
      .map(id => products.find(p => p.id === id))
      .filter(Boolean)
      .slice(0, 6) as typeof products;
  }, [recentViews, products]);

  const openProduct = async (product: any) => {
    const preview: ProductPreview = {
      ...product,
      id: product.id,
      title: product.title,
      price: Number(product.price ?? 0),
      image: product.image || PRODUCT_IMAGE_FALLBACK,
      source: product.source ?? 'marketplace',
      seller: product.seller ?? { name: 'MyPal', isMyPal: true },
      rating: Number(product.rating ?? 0),
      description: product.description,
      category: product.category,
    };
    setSelectedProduct(preview);

    try {
      const fullProduct = await productService.get(product.id);
      setSelectedProduct({
        ...fullProduct,
        source: 'marketplace',
        seller: fullProduct.seller ?? preview.seller,
      });
    } catch {
      // Keep the immediate preview if the detail endpoint is unavailable.
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 space-y-4 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center justify-between">
          <LogoIcon size={56} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/sell')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-cobalt text-primary-foreground text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
            >
              <Tag className="w-3.5 h-3.5" /> Sell
            </button>
            <div className="glass-card px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
              <span className="text-sm font-bold text-foreground">
                ${balance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Search Experience */}
        <div className="space-y-3">
          {/* Mode Toggle */}
          <div className="flex p-1 bg-secondary/50 rounded-xl w-fit border border-border/50 self-center mx-auto">
            <button
              onClick={() => setMode('internal')}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                mode === 'internal' ? "bg-white shadow-sm text-cobalt" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Database className="w-3 h-3" /> MyPal Internal
            </button>
            <button
              onClick={() => setMode('global')}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                mode === 'global' ? "bg-white shadow-sm text-purple-600" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Globe className="w-3 h-3" /> Global Agentic
            </button>
          </div>

          {/* Search Bar */}
          <div className="glass-card p-1 flex items-center gap-2 shadow-lg border-cobalt-light/20">
            <div className="flex-1 flex items-center gap-2 px-3">
              {mode === 'global' ? (
                <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0 animate-pulse" />
              ) : (
                <Search className="w-4 h-4 text-cobalt-light flex-shrink-0" />
              )}
              <Input
                ref={searchInputRef}
                placeholder={mode === 'global' ? "Ask the AI Agent to find anything..." : "Search internal inventory..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 h-10 text-sm"
              />
              <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border/50">/</span>
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className={cn(
                "p-2.5 rounded-lg transition-all shadow-md",
                mode === 'global' ? "bg-purple-600 hover:bg-purple-700" : "bg-gradient-cobalt hover:opacity-90"
              )}
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 text-primary-foreground" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Status Console (Progressive Disclosure) */}
      {isSearching && mode === 'global' && (
        <div className="px-4 animate-fade-in">
          <div className="glass-card border-purple-500/20 bg-purple-500/[0.02] p-4 space-y-3">
            <div className="flex items-center gap-2 text-purple-600">
              <Terminal className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Agentic Orchestration</span>
            </div>
            <div className="space-y-1.5">
              {consoleLogs.map((log, i) => (
                <div key={i} className="flex items-center gap-2 animate-fade-in">
                  <div className="w-1 h-1 rounded-full bg-purple-400" />
                  <p className="text-xs font-medium text-slate-600">{log}</p>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                <p className="text-xs font-bold text-purple-500 animate-pulse">Running agents...</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="px-4 space-y-8 mt-4">
        {/* Trending Now */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cobalt-light" />
              <h2 className="text-lg font-serif font-bold text-foreground">Trending Now</h2>
            </div>
            <button 
              onClick={() => navigate('/search?sort=trending')}
              className="text-xs font-bold text-cobalt-light flex items-center gap-0.5 hover:underline"
            >
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4">
            {trendingProducts.map((product) => (
              <div key={product.id} className="flex-shrink-0 w-[180px]">
                <ProductCard product={product} onClick={() => openProduct(product)} />
              </div>
            ))}
          </div>
        </section>

        {/* Recommended For You — AI-personalised, updates with searches/orders/wishlist */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-cobalt-light" />
              <h2 className="text-lg font-serif font-bold text-foreground">For You</h2>
              {!recLoading && recData && (
                <span className={cn(
                  "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                  recData.persona === 'personalized'
                    ? "bg-cobalt-light/10 text-cobalt-light"
                    : "bg-muted text-muted-foreground"
                )}>
                  {recData.persona === 'personalized' ? '✦ Personalised' : 'Popular'}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/ai-search')}
              className="text-xs font-bold text-cobalt-light flex items-center gap-0.5 hover:underline"
            >
              Search more <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {recLoading ? (
            /* Skeleton while AI engine is running */
            <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex-shrink-0 w-[180px] glass-card overflow-hidden animate-pulse">
                  <div className="aspect-square bg-secondary/60" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-secondary/60 rounded w-3/4" />
                    <div className="h-3 bg-secondary/60 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : recommendedProducts.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4">
              {recommendedProducts.map((product) => (
                <div key={product.id} className="flex-shrink-0 w-[180px]">
                  <ProductCard product={product} onClick={() => openProduct(product)} />
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Categories Grid (Enhanced Density) */}
        <section>
          <h2 className="text-lg font-serif font-bold text-foreground mb-4">Categories</h2>
          <div className="grid grid-cols-4 gap-3">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.name}
                  onClick={() => navigate(`/search?category=${encodeURIComponent(category.name)}`)}
                  className="glass-card p-4 flex flex-col items-center gap-3 hover:border-cobalt-light/50 transition-all hover:scale-105 active:scale-95"
                >
                  <div className={`w-12 h-12 rounded-2xl ${category.color} flex items-center justify-center shadow-inner`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 text-center leading-tight uppercase tracking-tighter">
                    {category.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Recently Viewed */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-lg font-serif font-bold text-foreground">Recently Viewed</h2>
            </div>
          </div>
          {recentlyViewedProducts.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4">
              {recentlyViewedProducts.map((product) => (
                <div key={product.id} className="flex-shrink-0 w-[180px]">
                  <ProductCard product={product} onClick={() => openProduct(product)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-card p-12 text-center border-dashed border-2">
              <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-bold text-muted-foreground">Empty history</p>
              <p className="text-xs text-muted-foreground">Items you view will appear here</p>
            </div>
          )}
        </section>
      </div>

      <ProductPreviewDrawer
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
      <BottomNav />
    </div>
  );
};

export default HomeScreen;
