import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

const VerifyScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  
  const phone = location.state?.phone || '+1 (555) 000-0000';

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }
    
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    
    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerify = () => {
    const code = otp.join('');
    if (code.length === 6) {
      login(phone);
      navigate('/home');
    } else {
      setError('Please enter a 6-digit code');
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (/^\d+$/.test(pastedData)) {
      const newOtp = [...otp];
      pastedData.split('').forEach((char, i) => {
        if (i < 6) newOtp[i] = char;
      });
      setOtp(newOtp);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 animate-fade-in-up">
        {/* Icon and Header */}
        <div className="glass-card p-6 space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-cobalt-light/10 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-cobalt-light" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-xl font-serif font-bold text-foreground">Verify Your Number</h1>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to{' '}
              <span className="text-foreground font-medium">{phone}</span>
            </p>
          </div>

          {/* OTP Input Boxes */}
          <div className="flex justify-center gap-2 py-4" onPaste={handlePaste}>
            {otp.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-11 h-14 text-center text-xl font-semibold bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-cobalt-light focus:border-transparent transition-all"
                autoFocus={index === 0}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive text-center">{error}</p>}

        <Button
          onClick={handleVerify}
          className="w-full bg-gradient-cobalt hover:opacity-90 text-primary-foreground"
        >
          Verify & Enter
        </Button>

        <Link
          to="/login"
          className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Change number
        </Link>
      </div>
    </div>
  );
};

export default VerifyScreen;
