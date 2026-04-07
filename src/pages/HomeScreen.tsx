import { useNavigate } from 'react-router-dom';
import { useMockStore } from '@/lib/useMockStore';
import { mockProducts } from '@/mock/products';
import { 
  Search, Sparkles, TrendingUp, ChevronRight, Plus,
  Smartphone, Shirt, Home, Dumbbell, BookOpen, Car, Palette, Briefcase,
  Clock, Package
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import ProductCard from '@/components/ProductCard';
import LogoIcon from '@/components/LogoIcon';
import { useState } from 'react';

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
  const { balance, recentViews } = useMockStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/search');
    }
  };

  // Get trending products (highest rated)
  const trendingProducts = [...mockProducts]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 6);

  // Get recommended products (random selection with AI badge simulation)
  const recommendedProducts = [...mockProducts]
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);

  // Get recently viewed products
  const recentlyViewedProducts = recentViews
    .map(id => mockProducts.find(p => p.id === id))
    .filter(Boolean)
    .slice(0, 6) as typeof mockProducts;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <LogoIcon size={40} />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate('/sell')}
              size="sm"
              className="bg-gradient-cobalt hover:opacity-90 text-primary-foreground gap-1"
            >
              <Plus className="w-4 h-4" /> Sell
            </Button>
            <div className="glass-card px-3 py-1.5 flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">
                ${balance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="glass-card p-1 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3">
            <Sparkles className="w-4 h-4 text-cobalt-light flex-shrink-0" />
            <Input
              placeholder="Search anything globally..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 h-10"
            />
          </div>
          <button
            onClick={handleSearch}
            className="bg-gradient-cobalt p-2.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Search className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 space-y-6">
        {/* Trending Now */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cobalt-light" />
              <h2 className="text-base font-semibold text-foreground">Trending Now</h2>
            </div>
            <button 
              onClick={() => navigate('/search?sort=trending')}
              className="text-xs text-cobalt-light flex items-center gap-0.5 hover:underline"
            >
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
            {trendingProducts.map((product) => (
              <div key={product.id} className="flex-shrink-0 w-[160px]">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </section>

        {/* Recommended for You */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <h2 className="text-base font-semibold text-foreground">Recommended for You</h2>
              <span className="text-[10px] bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded-full font-medium">
                AI
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {recommendedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

        {/* Recently Viewed */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Recently Viewed</h2>
            </div>
          </div>
          {recentlyViewedProducts.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
              {recentlyViewedProducts.map((product) => (
                <div key={product.id} className="flex-shrink-0 w-[160px]">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-card p-8 text-center">
              <Package className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No recently viewed items</p>
              <p className="text-xs text-muted-foreground">Start browsing to see your history</p>
            </div>
          )}
        </section>

        {/* Browse Categories */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">Browse Categories</h2>
          <div className="grid grid-cols-4 gap-3">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.name}
                  onClick={() => navigate(`/search?category=${encodeURIComponent(category.name)}`)}
                  className="glass-card p-3 flex flex-col items-center gap-2 hover:border-cobalt-light/50 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl ${category.color} flex items-center justify-center`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] text-foreground text-center leading-tight">
                    {category.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  );
};

export default HomeScreen;
