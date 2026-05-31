import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Heart, Wallet, ShoppingCart, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAsync } from '@/hooks/useAsync';
import { cartService } from '@/services/cartService';
import { useAuthStore } from '@/stores/authStore';

const navItems = [
  { path: '/home',      icon: Home,         label: 'Home' },
  { path: '/search',    icon: Search,       label: 'Search' },
  { path: '/ai-search', icon: Sparkles,     label: 'AI' },
  { path: '/cart',      icon: ShoppingCart, label: 'Cart',    badge: true },
  { path: '/wallet',    icon: Wallet,       label: 'Wallet' },
  { path: '/wishlist',  icon: Heart,        label: 'Wishlist' },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Fetch cart count — only if logged in, silently ignore errors
  const { data: cartData } = useAsync(
    () => (user ? cartService.get() : Promise.resolve(null)),
    [user?.id],
  );
  const cartCount = cartData?.items?.length ?? 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-md border-t border-border/50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around py-2 px-1 max-w-2xl mx-auto">
        {navItems.map(({ path, icon: Icon, label, badge }) => {
          const active = location.pathname === path;
          const showBadge = badge && cartCount > 0;

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'relative flex flex-col items-center gap-1 py-2 px-2 sm:px-3 rounded-2xl transition-all duration-200 min-w-[44px] min-h-[44px] justify-center',
                active
                  ? 'text-cobalt bg-cobalt/8 scale-105'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary active:scale-95',
              )}
              aria-label={label}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    'w-5 h-5 transition-all',
                    active ? 'stroke-[2.5px]' : 'stroke-[1.5px]',
                  )}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-cobalt-light text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  'text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all leading-none',
                  active ? 'opacity-100' : 'opacity-50',
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;
