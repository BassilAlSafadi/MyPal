import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Lock, ArrowRight, ShieldCheck, User, Globe, MapPin, Building2 } from 'lucide-react';
import LogoIcon from '@/components/LogoIcon';
import { authService } from '@/services/authService';

// Common markets first, then alphabetical — enough for an enterprise-style signup.
const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'United Arab Emirates',
  'Saudi Arabia', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Sweden',
  'India', 'Pakistan', 'Bangladesh', 'Egypt', 'Jordan', 'Lebanon', 'Qatar', 'Kuwait',
  'Bahrain', 'Oman', 'Turkey', 'Brazil', 'Mexico', 'Japan', 'South Korea', 'Singapore',
  'Malaysia', 'Indonesia', 'Philippines', 'South Africa', 'Nigeria', 'Kenya', 'Other',
];

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const SignupScreen = () => {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordChecks = useMemo(() => ({
    minLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  }), [password]);

  const canSubmit =
    name.length > 1 &&
    email.includes('@') &&
    passwordChecks.minLength && passwordChecks.hasNumber && passwordChecks.hasSpecial &&
    country.length > 0 && stateProvince.trim().length > 0 && city.trim().length > 0;

  const handleGoogleSignup = () => {
    authService.loginWithGoogle();
  };

  const handleSignup = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const user = await authService.signUpWithEmail(email, password, name.trim(), {
        country,
        state: stateProvince.trim(),
        city: city.trim(),
      });
      setUser(user);
      navigate('/home');
    } catch (err: any) {
      setError(err?.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 animate-fade-in-up">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <LogoIcon size={64} showWordmark={false} />
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Create your account</h1>
          <p className="text-sm text-muted-foreground">Start your AI-powered discovery journey</p>
        </div>

        <Button
          onClick={handleGoogleSignup}
          variant="outline"
          disabled={loading}
          className="w-full h-12 gap-3 text-foreground border-border hover:bg-secondary"
        >
          <GoogleIcon />
          Sign up with Google
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Full Name
              </label>
              <div className="flex items-center gap-3 px-1">
                <User className="w-4 h-4 text-cobalt-light" />
                <Input
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-transparent border-none p-0 h-auto text-sm focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="h-[1px] bg-border/50" />

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Email Address
              </label>
              <div className="flex items-center gap-3 px-1">
                <Mail className="w-4 h-4 text-cobalt-light" />
                <Input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-transparent border-none p-0 h-auto text-sm focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="h-[1px] bg-border/50" />

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Password
              </label>
              <div className="flex items-center gap-3 px-1">
                <Lock className="w-4 h-4 text-cobalt-light" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                  className="bg-transparent border-none p-0 h-auto text-sm focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="h-[1px] bg-border/50" />

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Country
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
                    <option key={c} value={c} className="bg-background text-foreground">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="h-[1px] bg-border/50" />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  State / Province
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
                  City
                </label>
                <div className="flex items-center gap-2 px-1">
                  <Building2 className="w-4 h-4 text-cobalt-light flex-shrink-0" />
                  <Input
                    placeholder="e.g. San Jose"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                    className="bg-transparent border-none p-0 h-auto text-sm focus-visible:ring-0"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-1.5 px-1">
            <div className={`flex items-center gap-2 text-[10px] font-medium ${passwordChecks.minLength ? 'text-emerald-500' : 'text-slate-400'}`}>
              <ShieldCheck className="w-3 h-3" /> 8+ Characters
            </div>
            <div className={`flex items-center gap-2 text-[10px] font-medium ${passwordChecks.hasNumber ? 'text-emerald-500' : 'text-slate-400'}`}>
              <ShieldCheck className="w-3 h-3" /> Includes Number
            </div>
            <div className={`flex items-center gap-2 text-[10px] font-medium ${passwordChecks.hasSpecial ? 'text-emerald-500' : 'text-slate-400'}`}>
              <ShieldCheck className="w-3 h-3" /> Includes Special Char
            </div>
          </div>

          {error && <p className="text-xs text-destructive text-center">{error}</p>}
          
          <Button
            onClick={handleSignup}
            disabled={!canSubmit || loading}
            className="w-full bg-gradient-cobalt hover:opacity-90 text-primary-foreground h-12 rounded-xl gap-2 shadow-lg shadow-cobalt/20"
          >
            {loading ? 'Creating Account...' : 'Create Account'} <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-cobalt-light hover:underline font-medium">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignupScreen;
