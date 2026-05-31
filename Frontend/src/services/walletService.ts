import { apiClient } from '@/api/client';

export interface WalletBalance {
  balance: number;
  escrow: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  type: string;        // 'Deposit' | 'Purchase' | 'Refund'
  amount: number;      // negative = outflow (e.g. withdrawal / purchase)
  orderId?: string | null;
  createdAt?: string | null;
}

interface RawTxn {
  id: string;
  type?: string;
  amount?: number | string;
  order_id?: string | null;
  created_at?: string | null;
}

export const walletService = {
  getBalance: async (): Promise<WalletBalance> => {
    const r = await apiClient.get<{ balance: number | string; escrow: number | string; currency: string }>(
      '/api/v1/wallet',
    );
    return { balance: Number(r.balance ?? 0), escrow: Number(r.escrow ?? 0), currency: r.currency ?? 'USD' };
  },

  getTransactions: async (): Promise<WalletTransaction[]> => {
    const r = await apiClient.get<{ transactions: RawTxn[] }>('/api/v1/wallet/transactions');
    return (r.transactions ?? []).map((t) => ({
      id: t.id,
      type: t.type ?? 'Deposit',
      amount: Number(t.amount ?? 0),
      orderId: t.order_id,
      createdAt: t.created_at,
    }));
  },

  deposit: async (amount: number): Promise<number> => {
    const r = await apiClient.post<{ balance: number | string }>('/api/v1/wallet/deposit', { amount });
    return Number(r.balance ?? 0);
  },

  withdraw: async (amount: number): Promise<number> => {
    const r = await apiClient.post<{ balance: number | string }>('/api/v1/wallet/withdraw', { amount });
    return Number(r.balance ?? 0);
  },
};
