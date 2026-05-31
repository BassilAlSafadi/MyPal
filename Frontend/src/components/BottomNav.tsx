import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Heart, Wallet, Settings, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/home',      icon: Home,     label: 'Home' },
  { path: '/search',    icon: Search,   label: 'Search' },
  { path: '/ai-search', icon: Sparkles, label: 'AI' },
  { path: '/wallet',    icon: Wallet,   label: 'Capital' },
  { path: '/wishlist',  icon: Heart,    label: 'Targets' },
  { path: '/settings',  icon: Settings, label: 'Engine' },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-md border-t border-border/50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around py-2 px-1 max-w-2xl mx-auto">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path;

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              /* 44px min touch target */
              className={cn(
                'flex flex-col items-center gap-1 py-2 px-2 sm:px-4 rounded-2xl transition-all duration-200 min-w-[44px] min-h-[44px] justify-center',
                active
                  ? 'text-cobalt bg-cobalt/8 scale-105'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary active:scale-95',
              )}
              aria-label={label}
            >
              <Icon
                className={cn(
                  'w-5 h-5 transition-all',
                  active ? 'stroke-[2.5px]' : 'stroke-[1.5px]',
                )}
              />
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
