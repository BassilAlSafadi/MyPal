import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { tokenStore, refreshTokenStore, apiClient, GatewayError } from '@/api/client';
import { env } from '@/config/env';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * Handles the redirect from Google OAuth.
 * C# sends: GET /auth/callback?access_token=<jwt>&refresh_token=<jwt>
 *
 * The refresh token is in the URL so it can be persisted in localStorage
 * immediately — iOS Safari and other mobile browsers block cross-site
 * cookies, making the httpOnly cookie approach unreliable.
 *
 * Fetches the full profile via /api/v1/users/me with retry for cold-starting
 * HF spaces. If the profile endpoint stays unavailable after OAuth issued
 * tokens, keeps the session and enters the app with a token-derived fallback.
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
    const accessToken  = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');

    if (!accessToken) {
      navigate('/login', { replace: true });
      return;
    }

    tokenStore.set(accessToken);
    // Persist in localStorage immediately so reloads survive on all browsers,
    // including iOS Safari which blocks cross-site httpOnly cookies.
    if (refreshToken) refreshTokenStore.set(refreshToken);
    bootstrapGatewaySession(accessToken);

    // Poll until the profile loads or we give up (~40 s total).
    // HF spaces can take 30 s on a cold start; a single 4 s retry isn't enough.
    const DELAYS = [3000, 5000, 8000, 10000, 14000]; // 3+5+8+10+14 = 40 s
    let attempt = 0;

    const tryFetch = () => {
      apiClient.get<any>('/api/v1/users/me')
        .then(applyProfile)
        .catch((err) => {
          const isAuthError =
            (err instanceof GatewayError && (err.status === 401 || err.status === 403)) ||
            (typeof err?.status === 'number' && (err.status === 401 || err.status === 403));

          if (isAuthError) {
            tokenStore.clear();
            refreshTokenStore.clear();
            navigate('/login?error=session_failed', { replace: true });
            return;
          }

          if (attempt < DELAYS.length) {
            setRetrying(true);
            setTimeout(tryFetch, DELAYS[attempt++]);
          } else {
            const fallbackUser = userFromAccessToken(accessToken);
            if (fallbackUser) {
              setUser(fallbackUser);
              navigate('/home', { replace: true });
              return;
            }
            // Exhausted profile retries. Keep the OAuth session alive if the
            // issued access token can identify the user.
            tokenStore.clear();
            refreshTokenStore.clear();
            navigate('/login?error=session_failed', { replace: true });
          }
        });
    };
    tryFetch();
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

function bootstrapGatewaySession(accessToken: string): void {
  try {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    const traceId = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');

    fetch(`${env.API_GATEWAY}/api/v1/auth/bootstrap-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Trace-ID': traceId,
      },
      body: '{}',
      credentials: 'include',
    }).catch(() => {});
  } catch {
    // Non-fatal: localStorage refresh-token restoration is the primary path.
  }
}

function userFromAccessToken(accessToken: string) {
  try {
    const payload = decodeJwtPayload(accessToken);
    const email = typeof payload.email === 'string' ? payload.email : '';
    const roles = typeof payload.roles === 'string'
      ? payload.roles.split(',').map((role: string) => role.trim()).filter(Boolean)
      : Array.isArray(payload.roles) ? payload.roles : [];

    return {
      id: String(payload.sub || ''),
      email,
      username: email.split('@')[0] || '',
      is_buyer: parseJwtBoolean(payload.is_buyer, true),
      is_seller: parseJwtBoolean(payload.is_seller, false),
      roles,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, any> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid token');

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return JSON.parse(atob(padded));
}

function parseJwtBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}

export default AuthCallback;
