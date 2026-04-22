export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

export interface Order {
  id: string;
  productTitle: string;
  productImage: string;
  price: number;
  quantity: number;
  seller: {
    name: string;
    isMyPal: boolean;
  };
  status: OrderStatus;
  orderDate: string;
  deliveryDate?: string;
  trackingNumber?: string;
}

export const mockOrders: Order[] = [
  {
    id: 'ORD-2024-101',
    productTitle: 'MacBook Pro Charger 96W',
    productImage: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400&h=400&fit=crop',
    price: 79.99,
    quantity: 1,
    seller: { name: 'TechZone', isMyPal: true },
    status: 'delivered',
    orderDate: '2024-03-14',
    deliveryDate: '2024-03-17',
    trackingNumber: 'TRK123456789',
  },
  {
    id: 'ORD-2024-102',
    productTitle: 'iPhone 14 Pro Case - Clear',
    productImage: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400&h=400&fit=crop',
    price: 45.00,
    quantity: 1,
    seller: { name: 'CaseMaster', isMyPal: true },
    status: 'shipped',
    orderDate: '2024-03-11',
    trackingNumber: 'TRK987654321',
  },
  {
    id: 'ORD-2024-103',
    productTitle: 'Wireless Mouse Logitech MX Master 3',
    productImage: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&h=400&fit=crop',
    price: 89.99,
    quantity: 1,
    seller: { name: 'OfficeSupply', isMyPal: false },
    status: 'delivered',
    orderDate: '2024-03-08',
    deliveryDate: '2024-03-12',
    trackingNumber: 'TRK456789123',
  },
  {
    id: 'ORD-2024-104',
    productTitle: 'USB-C Hub 7-in-1',
    productImage: 'https://images.unsplash.com/photo-1625723044792-44de16ccb4e9?w=400&h=400&fit=crop',
    price: 49.99,
    quantity: 1,
    seller: { name: 'GadgetWorld', isMyPal: true },
    status: 'delivered',
    orderDate: '2024-03-03',
    deliveryDate: '2024-03-06',
    trackingNumber: 'TRK789123456',
  },
  {
    id: 'ORD-2024-105',
    productTitle: 'Collectible Action Figure - Limited Edition',
    productImage: 'https://images.unsplash.com/photo-1608889825103-eb5ed706fc64?w=400&h=400&fit=crop',
    price: 85.00,
    quantity: 1,
    seller: { name: 'CollectorShop', isMyPal: true },
    status: 'pending',
    orderDate: '2024-02-25',
  },
  {
    id: 'ORD-2024-106',
    productTitle: 'Screen Protector Pack (3-Pack)',
    productImage: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&h=400&fit=crop',
    price: 24.99,
    quantity: 1,
    seller: { name: 'AccessoryHub', isMyPal: false },
    status: 'refunded',
    orderDate: '2024-02-22',
  },
  {
    id: 'ORD-2024-107',
    productTitle: 'Mechanical Keyboard Keycaps Set',
    productImage: 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=400&h=400&fit=crop',
    price: 65.00,
    quantity: 1,
    seller: { name: 'KeyboardMasters', isMyPal: true },
    status: 'delivered',
    orderDate: '2024-02-15',
    deliveryDate: '2024-02-20',
    trackingNumber: 'TRK321654987',
  },
  {
    id: 'ORD-2024-108',
    productTitle: 'Vintage Vinyl Record - The Beatles',
    productImage: 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?w=400&h=400&fit=crop',
    price: 120.00,
    quantity: 1,
    seller: { name: 'VinylVault', isMyPal: true },
    status: 'delivered',
    orderDate: '2024-02-10',
    deliveryDate: '2024-02-15',
    trackingNumber: 'TRK654987321',
  },
];

export const getOrdersByStatus = (status: OrderStatus | 'all'): Order[] => {
  if (status === 'all') return mockOrders;
  return mockOrders.filter(o => o.status === status);
};
