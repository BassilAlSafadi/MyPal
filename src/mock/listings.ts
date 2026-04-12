export type ListingStatus = 'active' | 'sold' | 'draft' | 'expired';
export type ListingType = 'fixed' | 'auction' | 'offer';

export interface Listing {
  id: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  price: number;
  originalPrice?: number;
  listingType: ListingType;
  images: string[];
  status: ListingStatus;
  views: number;
  createdAt: string;
  soldAt?: string;
  buyerId?: string;
  buyerName?: string;
  specs?: Record<string, string>;
  shippingOptions: string[];
  quantity: number;
  // Auction-specific
  auctionEndDate?: string;
  currentBid?: number;
  reservePrice?: number;
  // Offer-specific
  minAcceptableOffer?: number;
}

export const mockListings: Listing[] = [
  {
    id: 'listing-001',
    title: 'Sony WH-1000XM4 Wireless Headphones',
    description: 'Excellent condition, barely used. Comes with original case and all accessories. Industry-leading noise cancellation.',
    category: 'Electronics',
    condition: 'like-new',
    price: 245,
    originalPrice: 349,
    listingType: 'fixed',
    images: ['https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&h=400&fit=crop'],
    status: 'sold',
    views: 342,
    createdAt: '2024-03-01',
    soldAt: '2024-03-15',
    buyerId: 'user-john',
    buyerName: 'John M.',
    specs: { 'Battery': '30 hours', 'Color': 'Black' },
    shippingOptions: ['Seller Ships', 'Free Shipping'],
    quantity: 1,
  },
  {
    id: 'listing-002',
    title: 'Nintendo Switch Game Bundle (5 Games)',
    description: 'Selling my Switch game collection. All discs in perfect condition with original cases.',
    category: 'Electronics',
    condition: 'good',
    price: 120,
    listingType: 'fixed',
    images: ['https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=400&h=400&fit=crop'],
    status: 'sold',
    views: 189,
    createdAt: '2024-03-05',
    soldAt: '2024-03-10',
    buyerId: 'user-sarah',
    buyerName: 'Sarah K.',
    shippingOptions: ['Seller Ships'],
    quantity: 1,
  },
  {
    id: 'listing-003',
    title: 'Vintage 50mm Camera Lens - Canon FD Mount',
    description: 'Beautiful vintage lens from the 1970s. Sharp optics, smooth focus ring. Perfect for portrait photography.',
    category: 'Electronics',
    condition: 'good',
    price: 175,
    listingType: 'offer',
    minAcceptableOffer: 140,
    images: ['https://images.unsplash.com/photo-1617005082133-548c4dd27f35?w=400&h=400&fit=crop'],
    status: 'sold',
    views: 256,
    createdAt: '2024-02-20',
    soldAt: '2024-03-05',
    buyerId: 'user-mike',
    buyerName: 'Mike R.',
    specs: { 'Focal Length': '50mm', 'Aperture': 'f/1.4', 'Mount': 'Canon FD' },
    shippingOptions: ['Seller Ships', 'Local Pickup Only'],
    quantity: 1,
  },
  {
    id: 'listing-004',
    title: 'Custom Mechanical Keyboard - 65% Layout',
    description: 'Hand-built 65% mechanical keyboard. Gateron Yellow switches, PBT keycaps, aluminum case. Types like a dream.',
    category: 'Electronics',
    condition: 'new',
    price: 189,
    listingType: 'fixed',
    images: ['https://images.unsplash.com/photo-1595225476474-87563907a212?w=400&h=400&fit=crop'],
    status: 'active',
    views: 423,
    createdAt: '2024-03-10',
    specs: { 'Switches': 'Gateron Yellow', 'Keycaps': 'PBT', 'Layout': '65%' },
    shippingOptions: ['Seller Ships', 'Free Shipping'],
    quantity: 3,
  },
  {
    id: 'listing-005',
    title: 'Rare Pokémon Card Collection - 1st Edition',
    description: 'Selling my childhood collection. Includes 1st edition Charizard (PSA 7), multiple holos. Serious buyers only.',
    category: 'Collectibles & Art',
    condition: 'good',
    price: 2500,
    listingType: 'auction',
    currentBid: 1850,
    reservePrice: 2000,
    auctionEndDate: '2024-04-01',
    images: ['https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=400&h=400&fit=crop'],
    status: 'active',
    views: 1247,
    createdAt: '2024-03-15',
    specs: { 'Set': 'Base Set 1st Edition', 'Condition': 'PSA Graded', 'Cards': '25' },
    shippingOptions: ['Seller Ships'],
    quantity: 1,
  },
];

export const getListingsByStatus = (status: ListingStatus | 'all'): Listing[] => {
  if (status === 'all') return mockListings;
  return mockListings.filter(l => l.status === status);
};
