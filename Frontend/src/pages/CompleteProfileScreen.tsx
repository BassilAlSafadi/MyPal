import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { userService } from '@/services/userService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Globe, MapPin, Building2, ArrowRight, Loader2 } from 'lucide-react';
import LogoIcon from '@/components/LogoIcon';

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'United Arab Emirates',
  'Saudi Arabia', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Sweden',
  'India', 'Pakistan', 'Bangladesh', 'Egypt', 'Jordan', 'Lebanon', 'Qatar', 'Kuwait',
  'Bahrain', 'Oman', 'Turkey', 'Brazil', 'Mexico', 'Japan', 'South Korea', 'Singapore',
  'Malaysia', 'Indonesia', 'Philippines', 'South Africa', 'Nigeria', 'Kenya', 'Other',
];

/**
 * Post-Google-OAuth onboarding screen.
 *
 * Google only gives us name + email — no location.  This screen collects
 * country, state/province, and city so every account has the full profile
 * that the rest of the app expects (local delivery, personalisation, etc).
 *
 * Shown automatically by AuthCallback whenever `profile.country` is null.
 */
const CompleteProfileScreen = () => {
  const navigate    = useNavigate();
  const user        = useAuthStore((s) => s.user);
  const [country, setCountry]               = useState('');
  const [stateProvince, setStateProvince]   = useState('');
  const [city, setCity]                     = useState('');
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');

  const canSubmit = country.length > 0 && stateProvince.trim().length > 0 && city.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      await userService.updateProfile({
        country,
        state: stateProvince.trim(),
        city:  city.trim(),
      });
      navigate('/home', { replace: true });
    } catch (e: any) {
      setError(e?.message || 'Failed to save location. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 animate-fade-in-up">

        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <LogoIcon size={56} showWordmark={false} />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-serif font-bold text-foreground">
              One last step
            </h1>
            <p className="text-sm text-muted-foreground">
              {user?.email
                ? `Hi${user.email ? ` — we just need your location` : ''}. Where are you shopping from?`
                : 'Tell us where you are shopping from'}
            </p>
          </div>
        </div>

        {/* Location form */}
        <div className="glass-card p-4 space-y-4">

          {/* Country */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Country <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-3 px-1">
              <Globe className="w-4 h-4 text-cobalt-light" />
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="flex-1 bg-transparent border-none p-0 h-auto text-sm text-foreground focus:outline-none focus:ring-0"
              >
                <option value="" disabled className="bg-background text-muted-foreground">
                  Select your country
                </option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} className="bg-background text-foreground">{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="h-[1px] bg-border/50" />

          {/* State / Province + City side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                State / Province <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center gap-2 px-1">
                <MapPin className="w-4 h-4 text-cobalt-light flex-shrink-0" />
                <Input
                  placeholder="e.g. California"
                  value={stateProvince}
                  onChange={(e) => setStateProvince(e.target.value)}
                  className="bg-transparent border-none p-0 h-auto text-sm focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                City <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center gap-2 px-1">
                <Building2 className="w-4 h-4 text-cobalt-light flex-shrink-0" />
                <Input
                  placeholder="e.g. San Jose"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="bg-transparent border-none p-0 h-auto text-sm focus-visible:ring-0"
                />
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-destructive text-center">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="w-full bg-gradient-cobalt hover:opacity-90 text-primary-foreground h-12 rounded-xl gap-2 shadow-lg"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            : <>Continue to MyPal <ArrowRight className="w-4 h-4" /></>}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Location is used for delivery estimates and personalised recommendations.
          You can update it anytime in Settings.
        </p>
      </div>
    </div>
  );
};

export default CompleteProfileScreen;
