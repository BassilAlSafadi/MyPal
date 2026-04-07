import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import LogoIcon from '@/components/LogoIcon';
import { Progress } from '@/components/ui/progress';

const SplashScreen = () => {
  const navigate = useNavigate();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Animate progress bar
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 5;
      });
    }, 80);

    // Trigger fade out and navigate
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        navigate(isLoggedIn ? '/home' : '/login');
      }, 300);
    }, 2000);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(timer);
    };
  }, [isLoggedIn, navigate]);

  return (
    <div
      className={`fixed inset-0 bg-background flex flex-col items-center justify-center z-50 transition-opacity duration-300 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-6 animate-fade-in-up">
        {/* Large Logo */}
        <LogoIcon size={80} showWordmark={false} />
        
        {/* App Name */}
        <h1 className="text-[28px] font-serif font-bold text-foreground">
          MyPal
        </h1>
        
        {/* Subtitle - Only shown on splash screen */}
        <p className="text-sm text-muted-foreground tracking-wide">
          Global Inventory Agent
        </p>

        {/* Progress Bar */}
        <div className="w-32 mt-4">
          <Progress value={progress} className="h-1" />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
