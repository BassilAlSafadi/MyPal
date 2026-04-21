import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Phone, ArrowRight } from 'lucide-react';
import LogoIcon from '@/components/LogoIcon';

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
  const login = useAuthStore((s) => s.login);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const handleGoogleSignup = () => {
    // Mock Google signup - sets session and redirects
    login('+1 (555) 000-0000');
    navigate('/home');
  };

  const handleSendCode = () => {
    if (phone.length < 6) {
      setError('Please enter a valid phone number');
      return;
    }
    setError('');
    // Navigate to verify screen with isNewUser flag
    navigate('/verify', { state: { phone, isNewUser: true } });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 animate-fade-in-up">
        {/* Logo and Title */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <LogoIcon size={64} showWordmark={false} />
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Create Account</h1>
          <p className="text-sm text-muted-foreground">Join MyPal to start buying and selling</p>
        </div>

        {/* Google Signup */}
        <Button
          onClick={handleGoogleSignup}
          variant="outline"
          className="w-full h-12 gap-3 text-foreground border-border hover:bg-secondary"
        >
          <GoogleIcon />
          Continue with Google
        </Button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        {/* Phone Signup */}
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Phone Number
            </label>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-cobalt-light flex-shrink-0" />
              <Input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                className="bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            onClick={handleSendCode}
            className="w-full bg-gradient-cobalt hover:opacity-90 text-primary-foreground gap-2"
          >
            Send Code <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-cobalt-light hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignupScreen;
