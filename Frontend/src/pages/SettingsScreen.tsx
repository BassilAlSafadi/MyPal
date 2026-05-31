import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/components/ThemeProvider';
import type { Theme } from '@/components/ThemeProvider';
import { useAuthStore } from '@/stores/authStore';
import { useMockStore } from '@/lib/useMockStore';
import { userService } from '@/services/userService';
import { useAsync } from '@/hooks/useAsync';
import { 
  Settings, User, Shield, Phone, ChevronRight, Moon, Sun, Monitor,
  Bell, BellOff, Package, Trash2, Download, FileText, Lock, LogOut,
  Store, Star
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SettingsScreen = () => {
  const navigate = useNavigate();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const logout = useAuthStore((s) => s.logout);
  const { notifications, updateNotificationPref, clearSearchHistory } = useMockStore();
  const { data: profile } = useAsync(() => userService.getMe(), []);
  const fullName = profile?.fullName ?? '';
  const phone = profile?.phone ?? '';
  const initials = (fullName || profile?.email || 'U')
    .split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleClearHistory = () => {
    clearSearchHistory();
    toast.success('Search history cleared');
  };

  const handleExportData = () => {
    toast.info('Feature coming soon');
  };

  const themeOptions: { mode: Theme; icon: React.ReactNode; label: string }[] = [
    { mode: 'dark', icon: <Moon className="w-4 h-4" />, label: 'Dark' },
    { mode: 'light', icon: <Sun className="w-4 h-4" />, label: 'Light' },
    { mode: 'system', icon: <Monitor className="w-4 h-4" />, label: 'System' },
  ];

  return (
    <div className="min-h-screen bg-background pb-nav-safe">
      <div className="px-4 pt-6 pb-4 space-y-6">
        <h1 className="text-xl font-serif font-bold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5 text-cobalt-light" /> Settings
        </h1>

        {/* Account */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</h3>
          <div className="glass-card divide-y divide-border">
            <div className="p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-cobalt flex items-center justify-center">
                <span className="text-lg font-bold text-primary-foreground">
                  {initials}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{fullName || profile?.email}</p>
                <p className="text-xs text-muted-foreground">{phone || profile?.email}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Selling */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Selling</h3>
          <div className="glass-card divide-y divide-border">
            <button
              onClick={() => navigate('/my-listings')}
              className="w-full p-4 flex items-center gap-3"
            >
              <Store className="w-4 h-4 text-cobalt-light" />
              <span className="flex-1 text-sm text-foreground text-left">My Listings</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="p-4 flex items-center gap-3">
              <Star className="w-4 h-4 text-cobalt-light" />
              <span className="flex-1 text-sm text-foreground">Account Type</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-cobalt-light/10 text-cobalt-light capitalize">
                {profile?.isSeller ? 'Seller' : 'Buyer'}
              </span>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Security</h3>
          <div className="glass-card divide-y divide-border">
            <SettingRow icon={<Phone className="w-4 h-4 text-cobalt-light" />} label="Change Phone Number" />
            <SettingRow icon={<Shield className="w-4 h-4 text-cobalt-light" />} label="Biometric Lock" badge="Enabled" />
          </div>
        </div>

        {/* Appearance */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Appearance</h3>
          <div className="glass-card p-3">
            <div className="flex rounded-lg bg-secondary p-1">
              {themeOptions.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => setTheme(opt.mode)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all",
                    (theme === opt.mode || (theme === 'system' && opt.mode === 'system'))
                      ? "bg-gradient-cobalt text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notifications</h3>
          <div className="glass-card divide-y divide-border">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-cobalt-light" />
                <span className="text-sm text-foreground">Price Drop Alerts</span>
              </div>
              <Switch
                checked={notifications.priceDropAlerts}
                onCheckedChange={(checked) => updateNotificationPref('priceDropAlerts', checked)}
              />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-cobalt-light" />
                <span className="text-sm text-foreground">Order Updates</span>
              </div>
              <Switch
                checked={notifications.orderUpdates}
                onCheckedChange={(checked) => updateNotificationPref('orderUpdates', checked)}
              />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BellOff className="w-4 h-4 text-cobalt-light" />
                <span className="text-sm text-foreground">Weekly Deals</span>
              </div>
              <Switch
                checked={notifications.weeklyDeals}
                onCheckedChange={(checked) => updateNotificationPref('weeklyDeals', checked)}
              />
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Privacy</h3>
          <div className="glass-card divide-y divide-border">
            <button onClick={handleClearHistory} className="w-full p-4 flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-cobalt-light" />
              <span className="flex-1 text-sm text-foreground text-left">Clear Search History</span>
            </button>
            <button onClick={handleExportData} className="w-full p-4 flex items-center gap-3">
              <Download className="w-4 h-4 text-cobalt-light" />
              <span className="flex-1 text-sm text-foreground text-left">Export My Data</span>
            </button>
          </div>
        </div>

        {/* About */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">About</h3>
          <div className="glass-card divide-y divide-border">
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm text-foreground">App Version</span>
              <span className="text-sm text-muted-foreground">1.0.0-beta</span>
            </div>
            <SettingRow icon={<FileText className="w-4 h-4 text-cobalt-light" />} label="Terms of Service" />
            <SettingRow icon={<Lock className="w-4 h-4 text-cobalt-light" />} label="Privacy Policy" />
          </div>
        </div>

        {/* Sign Out */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full gap-2">
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign Out</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to sign out? You will need to log in again to access your account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground">
                Sign Out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <BottomNav />
    </div>
  );
};

const SettingRow = ({ icon, label, badge }: { icon: React.ReactNode; label: string; badge?: string }) => (
  <div className="p-4 flex items-center gap-3 cursor-pointer">
    {icon}
    <span className="flex-1 text-sm text-foreground">{label}</span>
    {badge && <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full">{badge}</span>}
    <ChevronRight className="w-4 h-4 text-muted-foreground" />
  </div>
);

export default SettingsScreen;
