import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { tokenStore, apiClient } from '@/api/client';
import { Loader2 } from 'lucide-react';

/**
 * Handles the redirect from Google OAuth.
 * C# sends: GET /auth/callback?access_token=<jwt>
 * We store the token then fetch /api/v1/users/me to get the full profile
 * (first_name, last_name, wallet_balance, etc.) rather than decoding the JWT
 * manually, which only has a subset of fields.
 */
const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate      = useNavigate();
  const setUser       = useAuthStore((s) => s.setUser);

  useEffect(() => {
    const accessToken = searchParams.get('access_token');

    if (!accessToken) {
      navigate('/login', { replace: true });
      return;
    }

    // Store token so apiClient includes it on the /users/me call
    tokenStore.set(accessToken);

    apiClient.get<any>('/api/v1/users/me')
      .then((profile) => {
        setUser({
          id:         profile.id,
          email:      profile.email,
          username:   profile.username ?? profile.email?.split('@')[0] ?? '',
          is_buyer:   profile.is_buyer  ?? true,
          is_seller:  profile.is_seller ?? false,
          roles:      Array.isArray(profile.roles) ? profile.roles : (profile.roles ?? 'buyer').split(','),
          created_at: profile.created_at ?? new Date().toISOString(),
          updated_at: profile.updated_at ?? new Date().toISOString(),
        });
        // Google OAuth users are created without location — redirect them
        // to the onboarding screen so country/state/city is always set.
        if (!profile.country) {
          navigate('/complete-profile', { replace: true });
        } else {
          navigate('/home', { replace: true });
        }
      })
      .catch(() => {
        // /users/me failed — fall back to a basic identity from the JWT payload
        // so the user still lands on home rather than a broken screen.
        try {
          const payload = JSON.parse(atob(accessToken.split('.')[1]));
          setUser({
            id:         payload.sub,
            email:      payload.email,
            username:   payload.email?.split('@')[0] ?? '',
            is_buyer:   payload.is_buyer === 'true' || payload.is_buyer === true,
            is_seller:  payload.is_seller === 'true' || payload.is_seller === true,
            roles:      typeof payload.roles === 'string' ? payload.roles.split(',') : (payload.roles ?? ['buyer']),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch {/* ignore */}
        navigate('/home', { replace: true });
      });
  }, [searchParams, setUser, navigate]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 text-cobalt animate-spin mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
};

export default AuthCallback;
