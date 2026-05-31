/** Helpers for deriving a visual "preview of a link" when a web finding has no product photo. */

/** Bare hostname without the leading www., or null if the URL can't be parsed. */
export function getDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** A favicon URL for the link's domain — "something of the link" instead of an empty box. */
export function faviconUrl(url?: string | null, size: 32 | 64 | 128 | 256 = 128): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
  } catch {
    return null;
  }
}
