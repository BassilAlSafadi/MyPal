import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { mockProducts, categories, brands, searchProducts, type Product } from '@/mock/products';
import { useMockStore } from '@/lib/useMockStore';
import { 
  Search, SlidersHorizontal, Sparkles, X, ChevronDown, Star, Plus
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BottomNav from '@/components/BottomNav';
import ProductCard, { ProductCardSkeleton } from '@/components/ProductCard';
import { cn } from '@/lib/utils';

type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest';
type FilterMode = 'filters' | 'ai';

const sortOptions = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'newest', label: 'Newest' },
];

const conditionOptions = [
  { value: 'new', label: 'New' },
  { value: 'like-new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'for-parts', label: 'For Parts' },
];

const SearchScreen = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToSearchHistory } = useMockStore();
  
  // URL params
  const initialQuery = searchParams.get('q') || '';
  const initialCategory = searchParams.get('category') || '';
  
  // State
  const [query, setQuery] = useState(initialQuery);
  const [filterMode, setFilterMode] = useState<FilterMode>('filters');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [isLoading, setIsLoading] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  
  // AI Mode state
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  
  // Filter state
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategory ? [initialCategory] : []
  );
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000]);
  const [minRating, setMinRating] = useState<number>(0);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCondition, setSelectedCondition] = useState<string>('');
  const [freeShippingOnly, setFreeShippingOnly] = useState(false);
  
  // Search and filter
  const handleSearch = () => {
    if (query.trim()) {
      addToSearchHistory(query.trim());
      setSearchParams({ q: query.trim() });
    }
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 300);
  };

  const handleAISearch = () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    // Simulate AI processing
    setTimeout(() => {
      setAiLoading(false);
      // Simple keyword matching
      setQuery(aiQuery);
    }, 1500);
  };

  const resetFilters = () => {
    setSelectedCategories([]);
    setPriceRange([0, 5000]);
    setMinRating(0);
    setSelectedBrands([]);
    setSelectedCondition('');
    setFreeShippingOnly(false);
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    let results = searchProducts(query, {
      category: selectedCategories.length > 0 ? selectedCategories : undefined,
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      minRating: minRating > 0 ? minRating : undefined,
      condition: selectedCondition || undefined,
      freeShipping: freeShippingOnly || undefined,
      brand: selectedBrands.length > 0 ? selectedBrands : undefined,
    });

    // Sort
    switch (sortBy) {
      case 'price_asc':
        results.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        results.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        results.sort((a, b) => b.rating - a.rating);
        break;
      case 'newest':
        results.sort(() => Math.random() - 0.5); // Simulate newest
        break;
    }

    return results;
  }, [query, selectedCategories, priceRange, minRating, selectedBrands, selectedCondition, freeShippingOnly, sortBy]);

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategories([initialCategory]);
    }
  }, [initialCategory]);

  const activeFilterCount = [
    selectedCategories.length > 0,
    priceRange[0] > 0 || priceRange[1] < 5000,
    minRating > 0,
    selectedBrands.length > 0,
    selectedCondition,
    freeShippingOnly,
  ].filter(Boolean).length;

  const aiSuggestions = [
    'Budget laptop under $500',
    'Wireless earbuds for gym',
    'Refurbished iPhone good condition',
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 space-y-4 sticky top-0 bg-background/95 backdrop-blur-sm z-30">
        {/* Search Bar */}
        <div className="glass-card p-1 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Input
              placeholder="Search products..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 h-10"
            />
            {query && (
              <button onClick={() => setQuery('')}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="bg-gradient-cobalt p-2.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Search className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilterMode('filters')}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all",
              filterMode === 'filters'
                ? "bg-gradient-cobalt text-primary-foreground"
                : "glass-card text-muted-foreground hover:text-foreground"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" /> Filters
            {activeFilterCount > 0 && filterMode !== 'filters' && (
              <span className="bg-cobalt-light text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilterMode('ai')}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all",
              filterMode === 'ai'
                ? "bg-gradient-cobalt text-primary-foreground"
                : "glass-card text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="w-4 h-4" /> Ask AI
          </button>
        </div>

        {/* Filter Mode UI */}
        {filterMode === 'filters' ? (
          <div className="flex items-center gap-2">
            <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="bg-cobalt-light text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto h-full pb-20 space-y-6 mt-4">
                  {/* Categories */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">Category</h4>
                    <div className="space-y-2">
                      {categories.map((cat) => (
                        <label key={cat} className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={selectedCategories.includes(cat)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedCategories([...selectedCategories, cat]);
                              } else {
                                setSelectedCategories(selectedCategories.filter(c => c !== cat));
                              }
                            }}
                          />
                          <span className="text-sm text-foreground">{cat}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Price Range */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-foreground">Price Range</h4>
                      <span className="text-sm text-muted-foreground">
                        ${priceRange[0]} - ${priceRange[1]}
                      </span>
                    </div>
                    <Slider
                      value={priceRange}
                      onValueChange={(value) => setPriceRange(value as [number, number])}
                      min={0}
                      max={5000}
                      step={50}
                      className="py-4"
                    />
                  </div>

                  {/* Rating */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">Minimum Rating</h4>
                    <div className="flex gap-2">
                      {[0, 1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          onClick={() => setMinRating(rating)}
                          className={cn(
                            "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all",
                            minRating === rating
                              ? "bg-gradient-cobalt text-primary-foreground"
                              : "glass-card text-muted-foreground"
                          )}
                        >
                          {rating > 0 && <Star className="w-3 h-3 fill-current" />}
                          {rating === 0 ? 'Any' : `${rating}+`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Condition */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">Condition</h4>
                    <div className="flex flex-wrap gap-2">
                      {conditionOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setSelectedCondition(
                            selectedCondition === opt.value ? '' : opt.value
                          )}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm transition-all",
                            selectedCondition === opt.value
                              ? "bg-gradient-cobalt text-primary-foreground"
                              : "glass-card text-muted-foreground"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Free Shipping */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Free Shipping Only</span>
                    <Switch
                      checked={freeShippingOnly}
                      onCheckedChange={setFreeShippingOnly}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" onClick={resetFilters} className="flex-1">
                      Reset
                    </Button>
                    <Button 
                      onClick={() => setFilterSheetOpen(false)} 
                      className="flex-1 bg-gradient-cobalt"
                    >
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-xs text-muted-foreground ml-auto">
              {filteredProducts.length} results
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              placeholder="Describe what you want in plain English..."
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              className="w-full h-24 glass-card p-3 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-0 resize-none focus:outline-none focus:ring-2 focus:ring-cobalt-light rounded-xl"
            />
            <div className="flex flex-wrap gap-2">
              {aiSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setAiQuery(suggestion)}
                  className="text-xs px-3 py-1.5 glass-card text-muted-foreground hover:text-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <Button 
              onClick={handleAISearch} 
              disabled={!aiQuery.trim() || aiLoading}
              className="w-full bg-gradient-cobalt gap-2"
            >
              {aiLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Apply with AI
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Results Grid */}
      <div className="px-4">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">No results found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or search terms
            </p>
            <Button variant="outline" onClick={resetFilters} className="mt-4">
              Reset Filters
            </Button>
          </div>
        )}
      </div>

      {/* Floating Sell Button */}
      <button
        onClick={() => navigate('/sell')}
        className="fixed right-4 bottom-24 w-14 h-14 bg-gradient-cobalt rounded-full flex items-center justify-center shadow-lg glow-cobalt hover:opacity-90 transition-opacity md:hidden"
      >
        <Plus className="w-6 h-6 text-primary-foreground" />
      </button>

      <BottomNav />
    </div>
  );
};

export default SearchScreen;
