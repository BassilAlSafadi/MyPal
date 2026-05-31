import { useState } from 'react';
import { walletService, type WalletTransaction } from '@/services/walletService';
import { useAsync } from '@/hooks/useAsync';
import {
  Wallet, Lock, ArrowUpRight, ArrowDownLeft, Plus,
  Minus, Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type FilterTab = 'all' | 'deposit' | 'withdrawal' | 'purchase' | 'refund';

const filterTabs: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'refund', label: 'Refunds' },
];

// A withdrawal is stored as a negative-amount Deposit (see the C# wallet endpoints).
function classify(tx: WalletTransaction): FilterTab {
  const t = (tx.type || '').toLowerCase();
  if (t === 'deposit') return tx.amount < 0 ? 'withdrawal' : 'deposit';
  if (t === 'purchase') return 'purchase';
  if (t === 'refund') return 'refund';
  return 'deposit';
}

const iconFor: Record<FilterTab, { icon: typeof ArrowUpRight; bg: string; text: string; label: string }> = {
  all:        { icon: Receipt,       bg: 'bg-muted',             text: 'text-muted-foreground', label: 'Transaction' },
  deposit:    { icon: Plus,          bg: 'bg-cobalt-light/10',   text: 'text-cobalt-light',     label: 'Deposit' },
  withdrawal: { icon: Minus,         bg: 'bg-muted',             text: 'text-muted-foreground', label: 'Withdrawal' },
  purchase:   { icon: ArrowUpRight,  bg: 'bg-destructive/10',    text: 'text-destructive',      label: 'Purchase' },
  refund:     { icon: ArrowDownLeft, bg: 'bg-green-500/10',      text: 'text-green-500',        label: 'Refund' },
};

const WalletScreen = () => {
  const { data: walletData, refetch: refetchBalance } = useAsync(() => walletService.getBalance(), []);
  const { data: txns, refetch: refetchTxns } = useAsync(() => walletService.getTransactions(), []);
  const balance = walletData?.balance ?? 0;
  const escrow = walletData?.escrow ?? 0;
  const transactions = txns ?? [];

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const [busy, setBusy] = useState(false);

  const filteredTransactions = transactions.filter((tx) =>
    activeTab === 'all' ? true : classify(tx) === activeTab,
  );
  const visibleTransactions = filteredTransactions.slice(0, visibleCount);

  const refresh = async () => { await Promise.all([refetchBalance(), refetchTxns()]); };

  const handleAddFunds = async () => {
    const value = parseFloat(amount);
    if (!(value > 0)) return;
    setBusy(true);
    try {
      await walletService.deposit(value);
      await refresh();
      toast.success(`$${value.toFixed(2)} added to wallet`);
      setShowAddFunds(false);
      setAmount('');
    } catch (e: any) {
      toast.error(e?.message || 'Deposit failed');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    const value = parseFloat(amount);
    if (!(value > 0)) return;
    if (value > balance) { toast.error('Insufficient balance'); return; }
    setBusy(true);
    try {
      await walletService.withdraw(value);
      await refresh();
      toast.success(`$${value.toFixed(2)} withdrawal initiated`);
      setShowWithdraw(false);
      setAmount('');
    } catch (e: any) {
      toast.error(e?.message || 'Withdrawal failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 pt-6 pb-4 space-y-4">
        <h1 className="text-xl font-serif font-bold text-foreground flex items-center gap-2">
          <Wallet className="w-5 h-5 text-cobalt-light" /> FinTech Wallet
        </h1>

        {/* Balance Card */}
        <div className="bg-gradient-cobalt rounded-2xl p-6 glow-cobalt space-y-4">
          <p className="text-xs text-primary-foreground/70 uppercase tracking-widest">Available Balance</p>
          <p className="text-4xl font-bold text-primary-foreground">${balance.toFixed(2)}</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-primary-foreground/60">Escrow / Pending</p>
              <p className="text-sm font-semibold text-primary-foreground">${escrow.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => setShowAddFunds(true)} className="h-12 bg-gradient-cobalt hover:opacity-90 gap-2">
            <Plus className="w-4 h-4" /> Add Funds
          </Button>
          <Button onClick={() => setShowWithdraw(true)} variant="outline" className="h-12 gap-2">
            <Minus className="w-4 h-4" /> Withdraw
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                activeTab === tab.value
                  ? "bg-gradient-cobalt text-primary-foreground"
                  : "glass-card text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Transactions */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Transaction History</h3>

          {visibleTransactions.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No transactions yet</p>
            </div>
          ) : (
            <>
              {visibleTransactions.map((tx) => {
                const kind = classify(tx);
                const config = iconFor[kind];
                const Icon = config.icon;
                const isPositive = tx.amount > 0;
                const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '';

                return (
                  <div key={tx.id} className="glass-card p-3 flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", config.bg)}>
                      <Icon className={cn("w-4 h-4", config.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium truncate">{config.label}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{date}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cn("text-sm font-semibold", isPositive ? "text-green-500" : "text-foreground")}>
                        {isPositive ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {visibleCount < filteredTransactions.length && (
                <Button variant="outline" className="w-full" onClick={() => setVisibleCount((p) => p + 10)}>
                  Load More
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Funds Dialog */}
      <Dialog open={showAddFunds} onOpenChange={setShowAddFunds}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Funds</DialogTitle>
            <DialogDescription>Enter the amount you want to add to your wallet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="pl-7" />
              </div>
            </div>
            <div className="flex gap-2">
              {[50, 100, 250, 500].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset.toString())}
                  className="flex-1 py-2 glass-card text-sm text-foreground hover:border-cobalt-light transition-colors"
                >
                  ${preset}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddFunds(false)}>Cancel</Button>
            <Button onClick={handleAddFunds} disabled={busy || !amount || parseFloat(amount) <= 0} className="bg-gradient-cobalt">
              Add Funds
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Funds</DialogTitle>
            <DialogDescription>Enter the amount you want to withdraw. Available: ${balance.toFixed(2)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" max={balance} className="pl-7" />
              </div>
            </div>
            <button onClick={() => setAmount(balance.toFixed(2))} className="text-sm text-cobalt-light hover:underline">
              Withdraw all (${balance.toFixed(2)})
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWithdraw(false)}>Cancel</Button>
            <Button
              onClick={handleWithdraw}
              disabled={busy || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance}
              className="bg-gradient-cobalt"
            >
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default WalletScreen;
