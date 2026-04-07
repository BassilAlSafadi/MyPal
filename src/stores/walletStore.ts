import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Transaction {
  id: string;
  type: 'credit' | 'debit' | 'escrow';
  amount: number;
  description: string;
  date: string;
}

interface WalletState {
  balance: number;
  escrow: number;
  transactions: Transaction[];
  addFunds: (amount: number, desc: string) => void;
  deductFunds: (amount: number, desc: string) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      balance: 500.00,
      escrow: 45.00,
      transactions: [
        { id: '1', type: 'credit', amount: 500, description: 'Initial Deposit', date: '2026-04-01' },
        { id: '2', type: 'escrow', amount: 45, description: 'Escrow: Bid on MacBook Pro', date: '2026-04-03' },
      ],
      addFunds: (amount, desc) =>
        set((s) => ({
          balance: s.balance + amount,
          transactions: [
            { id: Date.now().toString(), type: 'credit', amount, description: desc, date: new Date().toISOString().split('T')[0] },
            ...s.transactions,
          ],
        })),
      deductFunds: (amount, desc) =>
        set((s) => ({
          balance: s.balance - amount,
          transactions: [
            { id: Date.now().toString(), type: 'debit', amount, description: desc, date: new Date().toISOString().split('T')[0] },
            ...s.transactions,
          ],
        })),
    }),
    { name: 'mypal-wallet' }
  )
);
