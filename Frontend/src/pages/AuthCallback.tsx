import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { tokenStore, apiClient } from '@/api/client';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * Handles the redirect from Google OAuth.
 * C# sends: GET /auth/callback?access_token=<jwt>
 *
 * Fetches the full profile via /api/v1/users/me (with one retry after 4 s
 * for cold-starting HF spaces). Never falls back to a partial JWT-decoded
 * "demo user" — if both attempts fail, the user is sent back to login with
 * a clear error message.
 */
const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const setUser        = useAuthStore((s) => s.setUser);
  const [retrying, setRetrying] = useState(false);

  const applyProfile = (profile: any) => {
    setUser({
      id:         profile.id,
      email:      profile.email,
      username:   profile.username ?? profile.email?.split('@')[0] ?? '',
      is_buyer:   profile.is_buyer  ?? true,
      is_seller:  profile.is_seller ?? false,
      roles:      Array.isArray(profile.roles) ? profile.roles : [],
      created_at: profile.created_at ?? new Date().toISOString(),
      updated_at: profile.updated_at ?? new Date().toISOString(),
    });
    if (!profile.country) {
      navigate('/complete-profile', { replace: true });
    } else {
      navigate('/home', { replace: true });
    }
  };

  useEffect(() => {
    const accessToken = searchParams.get('access_token');

    if (!accessToken) {
      navigate('/login', { replace: true });
      return;
    }

    tokenStore.set(accessToken);

    apiClient.get<any>('/api/v1/users/me')
      .then(applyProfile)
      .catch(() => {
        // First attempt failed — HF C# space may be cold-starting.
        // Retry once after 4 s before giving up.
        setRetrying(true);
        setTimeout(() => {
          apiClient.get<any>('/api/v1/users/me')
            .then(applyProfile)
            .catch(() => {
              // Both attempts failed. Clear the token so we don't persist
              // stale ghost data, then send back to login with a message.
              tokenStore.clear();
              navigate('/login?error=session_failed', { replace: true });
            });
        }, 4000);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 px-6">
        <Loader2 className="w-8 h-8 text-cobalt animate-spin mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">
          {retrying ? 'Server is waking up, one moment…' : 'Signing you in…'}
        </p>
        {retrying && (
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            This can take up to 30 s on first load
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
