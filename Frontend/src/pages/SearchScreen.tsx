import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSearchStore, SearchResult } from '@/stores/searchStore';
import { Search, SlidersHorizontal, X, Database, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import ProductCard, { ProductCardSkeleton } from '@/components/ProductCard';
import { ProductPreviewDrawer } from '@/components/ProductPreviewDrawer';

const SearchScreen = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { query, setQuery, runSearch, isSearching, results, error } = useSearchStore();

  const initialQuery = searchParams.get('q') || '';

  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
      runSearch(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSelectedResult(null);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = () => {
    if (query.trim()) {
      setSearchParams({ q: query.trim() });
      runSearch(query.trim());
    }
  };

  return (
    <div className="min-h-screen bg-background pb-nav-safe">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-8 pb-4 sm:pb-6 space-y-4 sm:space-y-6 sticky top-0 bg-background/95 backdrop-blur-md z-30 border-b border-border/50">
        <div className="max-w-[1400px] mx-auto w-full space-y-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* Search Bar Group */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-secondary/50 border border-border/50 text-cobalt">
                  <Database className="w-3.5 h-3.5" /> MyPal Internal
                </div>
              </div>

              <div className="glass-card p-1 flex items-center gap-2 shadow-lg border-cobalt-light/20">
                <div className="flex-1 flex items-center gap-2 px-3">
                  <Search className="w-4 h-4 text-cobalt-light" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search resident inventory..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 h-10 text-base"
                  />
                  {query && (
                    <button onClick={() => setQuery('')} className="p-1 hover:bg-secondary rounded-full">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                  <span className="hidden md:block text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-1 rounded border border-border/50 tracking-tighter uppercase">Press / to focus</span>
                </div>
                <Button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="h-10 px-6 rounded-lg font-bold gap-2 shadow-md bg-gradient-cobalt hover:opacity-90"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span className="hidden sm:inline">Search</span>
                </Button>
              </div>
            </div>

            {/* Quick Filters Placeholder (Preserved Logic) */}
            <div className="flex items-center gap-3">
              <Button variant="outline" className="rounded-xl border-border/50 font-bold text-xs gap-2">
                <SlidersHorizontal className="w-4 h-4" /> Filters
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Workspace */}
      <div className="px-4 sm:px-6 py-4 sm:py-8 max-w-[1400px] mx-auto w-full">
        {isSearching && results.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-8">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-serif font-bold text-foreground">Resident Inventory Results</h2>
                <p className="text-sm text-muted-foreground font-medium">Found {results.length} matches for your query</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
              {results.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => setSelectedResult(product)}
                />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-32 space-y-4">
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <X className="w-10 h-10 text-destructive/60" />
            </div>
            <h3 className="text-2xl font-serif font-bold text-foreground">Search failed</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">{error}</p>
          </div>
        ) : (
          <div className="text-center py-32 space-y-4">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-2xl font-serif font-bold text-foreground">No matches identified</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Our agents couldn't find an exact match. Try adjusting your query.
            </p>
          </div>
        )}
      </div>

      {/* Side-Panel Product Detail */}
      <ProductPreviewDrawer
        product={selectedResult}
        isOpen={!!selectedResult}
        onClose={() => setSelectedResult(null)}
      />

      <BottomNav />
    </div>
  );
};

export default SearchScreen;
