export type TrustTier = 'new' | 'rising' | 'trusted' | 'top' | 'elite';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatarInitials: string;
  trustScore: number;
  trustTier: TrustTier;
  createdAt: string;
  totalSales: number;
  averageRating: number;
}

export const getTrustTier = (score: number): TrustTier => {
  if (score >= 95) return 'elite';
  if (score >= 80) return 'top';
  if (score >= 60) return 'trusted';
  if (score >= 30) return 'rising';
  return 'new';
};

export const getTrustBadgeConfig = (tier: TrustTier) => {
  const configs = {
    new: { label: 'New Seller', color: 'bg-muted text-muted-foreground' },
    rising: { label: 'Rising', color: 'bg-blue-500/10 text-blue-500' },
    trusted: { label: 'Trusted', color: 'bg-green-500/10 text-green-500' },
    top: { label: 'Top Seller', color: 'bg-purple-500/10 text-purple-500' },
    elite: { label: 'Elite', color: 'bg-amber-500/10 text-amber-500' },
  };
  return configs[tier];
};

export const mockUser: User = {
  id: 'demo-user-001',
  name: 'Demo User',
  phone: '+1 (555) 000-0000',
  email: 'demo@mypal.app',
  avatarInitials: 'DU',
  trustScore: 72,
  trustTier: 'trusted',
  createdAt: '2024-06-15T00:00:00Z',
  totalSales: 23,
  averageRating: 4.6,
};

export const computeTrustScore = (
  totalSales: number,
  averageRating: number,
  accountAgeDays: number
): number => {
  // Weighted formula:
  // 40% from sales (max 40 points at 50+ sales)
  // 40% from rating (max 40 points at 5.0 rating)
  // 20% from account age (max 20 points at 365+ days)
  
  const salesScore = Math.min(totalSales / 50, 1) * 40;
  const ratingScore = (averageRating / 5) * 40;
  const ageScore = Math.min(accountAgeDays / 365, 1) * 20;
  
  return Math.round(salesScore + ratingScore + ageScore);
};

export const verifiedSources = [
  { hostname: 'amazon.com', name: 'Amazon', verified: true },
  { hostname: 'ebay.com', name: 'eBay', verified: true },
  { hostname: 'bestbuy.com', name: 'Best Buy', verified: true },
  { hostname: 'walmart.com', name: 'Walmart', verified: true },
  { hostname: 'noon.com', name: 'Noon', verified: true },
];

export const checkSourceVerification = (url: string): { verified: boolean; name?: string } => {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const source = verifiedSources.find(s => hostname.includes(s.hostname));
    return source ? { verified: true, name: source.name } : { verified: false };
  } catch {
    return { verified: false };
  }
};
