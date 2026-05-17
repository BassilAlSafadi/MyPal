import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { tokenStore } from '@/api/client';
import { Loader2 } from 'lucide-react';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    const accessToken = searchParams.get('access_token');

    if (accessToken) {
      tokenStore.set(accessToken);
      // In a real app, we'd fetch the user profile here or decode the JWT
      // For now, we'll set a placeholder or decode it
      
      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        setUser({
          id: payload.sub,
          email: payload.email,
          username: payload.email.split('@')[0],
          is_buyer: payload.is_buyer === 'true',
          is_seller: payload.is_seller === 'true',
          roles: payload.roles.split(','),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Failed to parse token', e);
      }

      navigate('/home', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, setUser, navigate]);

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 text-cobalt animate-spin mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">Authenticating...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
