import { checkAllServicesHealth } from '@/api/client';

// Ping every service every 4 minutes while the tab is visible.
// This prevents idle hosting tiers from spinning down while someone is actively
// using the app. There are six services to keep warm now rather than one gateway.
// For true 24/7 uptime (no active user), a GitHub Actions cron handles the
// out-of-band pings.
const PING_INTERVAL_MS = 4 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;

async function ping() {
  if (document.visibilityState === 'hidden') return;
  try {
    await checkAllServicesHealth();
  } catch {
    // best-effort — silently ignore failures
  }
}

export function startKeepalive() {
  if (intervalId !== null) return;
  ping();
  intervalId = setInterval(ping, PING_INTERVAL_MS);
}

export function stopKeepalive() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
