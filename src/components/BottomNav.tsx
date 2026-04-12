import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Heart, Wallet, Settings, Sparkles, Plus } from 'lucide-react';

const navItems = [
  { path: '/home', icon: Home, label: 'Home' },
  { path: '/search', icon: Search, label: 'Search' },
  { path: '/ai-search', icon: Sparkles, label: 'AI Search' },
  { path: '/wallet', icon: Wallet, label: 'Wallet' },
  { path: '/wishlist', icon: Heart, label: 'Wishlist' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="bg-card/90 backdrop-blur-xl border-t border-border">
        <div className="flex items-center justify-around py-2 px-2 max-w-lg mx-auto relative">
          {navItems.map(({ path, icon: Icon, label }, index) => {
            const active = location.pathname === path;
            
            // Add FAB in the middle (after Wallet, before Wishlist)
            if (index === 3) {
              return (
                <div key={path} className="flex items-center gap-1">
                  <button
                    onClick={() => navigate(path)}
                    className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                      active
                        ? 'text-cobalt-light'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? 'drop-shadow-[0_0_6px_hsl(215,100%,60%)]' : ''}`} />
                    <span className="text-[10px] font-medium">{label}</span>
                  </button>
                  
                  {/* Sell FAB */}
                  <button
                    onClick={() => navigate('/sell')}
                    className="w-12 h-12 -mt-6 bg-gradient-cobalt rounded-full flex items-center justify-center shadow-lg glow-cobalt hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-6 h-6 text-primary-foreground" />
                  </button>
                </div>
              );
            }
            
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                  active
                    ? 'text-cobalt-light'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'drop-shadow-[0_0_6px_hsl(215,100%,60%)]' : ''}`} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomNav;
