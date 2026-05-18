import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Heart, Wallet, Settings } from 'lucide-react';

const navItems = [
  { path: '/home', icon: Home, label: 'Home' },
  { path: '/search', icon: Search, label: 'Orchestrator' },
  { path: '/wallet', icon: Wallet, label: 'Capital' },
  { path: '/wishlist', icon: Heart, label: 'Targets' },
  { path: '/settings', icon: Settings, label: 'Engine' },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-t border-border/50">
      <div className="flex items-center justify-around py-3 px-6 max-w-4xl mx-auto">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path;
          
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-1.5 py-2 px-6 rounded-2xl transition-all duration-300 ${
                active
                  ? 'text-cobalt bg-cobalt/5 scale-110'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Icon className={cn(
                "w-5 h-5 transition-transform",
                active ? "stroke-[2.5px]" : "stroke-[1.5px]"
              )} />
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest transition-all",
                active ? "opacity-100" : "opacity-60"
              )}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

import { cn } from '@/lib/utils';
export default BottomNav;
