export type TransactionType = 'sale' | 'purchase' | 'deposit' | 'escrow' | 'withdrawal';
export type TransactionStatus = 'completed' | 'pending' | 'refunded';

export interface Transaction {
  id: string;
  type: TransactionType;
  title: string;
  amount: number; // positive = credit, negative = debit
  counterparty: string;
  date: string;
  orderId: string;
  status: TransactionStatus;
}

export const mockTransactions: Transaction[] = [
  {
    id: 'tx-001',
    type: 'sale',
    title: 'Sony WH-1000XM4 Headphones',
    amount: 245.00,
    counterparty: 'John M.',
    date: '2024-03-15',
    orderId: 'ORD-2024-001',
    status: 'completed',
  },
  {
    id: 'tx-002',
    type: 'purchase',
    title: 'MacBook Pro Charger 96W',
    amount: -79.99,
    counterparty: 'TechZone',
    date: '2024-03-14',
    orderId: 'ORD-2024-002',
    status: 'completed',
  },
  {
    id: 'tx-003',
    type: 'deposit',
    title: 'Wallet Top-up',
    amount: 500.00,
    counterparty: 'Bank Transfer',
    date: '2024-03-12',
    orderId: 'DEP-2024-001',
    status: 'completed',
  },
  {
    id: 'tx-004',
    type: 'escrow',
    title: 'iPhone 14 Pro Case',
    amount: -45.00,
    counterparty: 'CaseMaster',
    date: '2024-03-11',
    orderId: 'ORD-2024-003',
    status: 'pending',
  },
  {
    id: 'tx-005',
    type: 'sale',
    title: 'Nintendo Switch Game Bundle',
    amount: 120.00,
    counterparty: 'Sarah K.',
    date: '2024-03-10',
    orderId: 'ORD-2024-004',
    status: 'completed',
  },
  {
    id: 'tx-006',
    type: 'purchase',
    title: 'Wireless Mouse Logitech MX',
    amount: -89.99,
    counterparty: 'OfficeSupply',
    date: '2024-03-08',
    orderId: 'ORD-2024-005',
    status: 'completed',
  },
  {
    id: 'tx-007',
    type: 'withdrawal',
    title: 'Bank Withdrawal',
    amount: -200.00,
    counterparty: 'Bank Account ****4521',
    date: '2024-03-07',
    orderId: 'WTH-2024-001',
    status: 'completed',
  },
  {
    id: 'tx-008',
    type: 'sale',
    title: 'Vintage Camera Lens 50mm',
    amount: 175.00,
    counterparty: 'Mike R.',
    date: '2024-03-05',
    orderId: 'ORD-2024-006',
    status: 'completed',
  },
  {
    id: 'tx-009',
    type: 'purchase',
    title: 'USB-C Hub 7-in-1',
    amount: -49.99,
    counterparty: 'GadgetWorld',
    date: '2024-03-03',
    orderId: 'ORD-2024-007',
    status: 'completed',
  },
  {
    id: 'tx-010',
    type: 'deposit',
    title: 'Wallet Top-up',
    amount: 250.00,
    counterparty: 'Card ****8832',
    date: '2024-03-01',
    orderId: 'DEP-2024-002',
    status: 'completed',
  },
  {
    id: 'tx-011',
    type: 'sale',
    title: 'Mechanical Keyboard Custom',
    amount: 189.00,
    counterparty: 'Alex T.',
    date: '2024-02-28',
    orderId: 'ORD-2024-008',
    status: 'completed',
  },
  {
    id: 'tx-012',
    type: 'escrow',
    title: 'Collectible Action Figure',
    amount: -85.00,
    counterparty: 'CollectorShop',
    date: '2024-02-25',
    orderId: 'ORD-2024-009',
    status: 'pending',
  },
  {
    id: 'tx-013',
    type: 'purchase',
    title: 'Screen Protector Pack',
    amount: -24.99,
    counterparty: 'AccessoryHub',
    date: '2024-02-22',
    orderId: 'ORD-2024-010',
    status: 'refunded',
  },
  {
    id: 'tx-014',
    type: 'sale',
    title: 'Bluetooth Speaker JBL',
    amount: 65.00,
    counterparty: 'Emma L.',
    date: '2024-02-20',
    orderId: 'ORD-2024-011',
    status: 'completed',
  },
  {
    id: 'tx-015',
    type: 'deposit',
    title: 'Referral Bonus',
    amount: 25.00,
    counterparty: 'MyPal Rewards',
    date: '2024-02-18',
    orderId: 'REF-2024-001',
    status: 'completed',
  },
];

export const getTransactionsByType = (type: TransactionType | 'all'): Transaction[] => {
  if (type === 'all') return mockTransactions;
  return mockTransactions.filter(t => t.type === type);
};
