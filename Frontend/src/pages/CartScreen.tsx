import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote,
  Package, ArrowRight, Loader2, ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import ProductImage from '@/components/ProductImage';
import { cartService, CartItem } from '@/services/cartService';
import { orderService } from '@/services/orderService';
import { walletService } from '@/services/walletService';
import { useAsync } from '@/hooks/useAsync';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

type PaymentMethod = 'wallet' | 'cod';

const CartScreen = () => {
  const navigate = useNavigate();
  const [removing, setRemoving]     = useState<string | null>(null);
  const [ordering, setOrdering]     = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [payMethod, setPayMethod]   = useState<PaymentMethod>('wallet');

  const { data: cartData, loading: cartLoading, refetch: refetchCart } =
    useAsync(() => cartService.get(), []);
  const { data: walletData } = useAsync(() => walletService.getBalance(), []);

  const items    = cartData?.items ?? [];
  const total    = cartData?.total ?? 0;
  const balance  = walletData?.balance ?? 0;
  const isEmpty  = !cartLoading && items.length === 0;
  const canWallet = balance >= total;

  const handleRemove = useCallback(async (productId: string) => {
    setRemoving(productId);
    try {
      await cartService.removeItem(productId);
      await refetchCart();
      toast.success('Item removed from cart');
    } catch {
      toast.error('Could not remove item');
    } finally {
      setRemoving(null);
    }
  }, [refetchCart]);

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setOrdering(true);
    try {
      const paymentMethodNum = payMethod === 'wallet' ? 1 : 2;
      const order = await orderService.create({
        items: items.map((i) => ({ productId: i.product_id, quantity: i.quantity })),
        paymentMethod: paymentMethodNum,
        walletAmountUsed: payMethod === 'wallet' ? total : 0,
        codAmountDue:     payMethod === 'cod'    ? total : undefined,
      });
      const orderId = order.id ?? order.order_id;
      toast.success('Order placed!', {
        description: orderId
          ? `Order #${orderId.slice(0, 8).toUpperCase()} is confirmed.`
          : 'Your order is confirmed and being prepared.',
      });
      setShowCheckout(false);
      // Refresh cart (will be empty after order)
      await refetchCart();
    } catch (err: any) {
      toast.error('Checkout failed', {
        description: err?.message || 'Please try again.',
      });
    } finally {
      setOrdering(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-nav-safe">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 sticky top-0 bg-background/90 backdrop-blur-md z-10 border-b border-border/50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-serif font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-cobalt-light" />
            My Cart
          </h1>
          {items.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {items.length} item{items.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Loading */}
        {cartLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-4 flex gap-3 animate-pulse">
                <Skeleton className="w-20 h-20 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
              <ShoppingCart className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-serif font-bold text-foreground">Your cart is empty</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Browse the catalog and add items to get started.
            </p>
            <Button
              onClick={() => navigate('/search')}
              className="bg-gradient-cobalt gap-2 mt-2"
            >
              Browse Products <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Cart items */}
        {!cartLoading && items.length > 0 && (
          <>
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  removing={removing === item.product_id}
                  onRemove={() => handleRemove(item.product_id)}
                />
              ))}
            </div>

            {/* Order summary */}
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">Order Summary</h3>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal ({items.length} item{items.length > 1 ? 's' : ''})</span>
                  <span>${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Shipping</span>
                  <span className="text-success font-medium">Free</span>
                </div>
                <div className="h-px bg-border/50 my-1" />
                <div className="flex justify-between text-base font-bold text-foreground">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Wallet balance info */}
            <div className={cn(
              'glass-card p-3 flex items-center gap-2 text-xs',
              canWallet ? 'border-success/30 bg-success/5' : 'border-amber-500/30 bg-amber-500/5',
            )}>
              <CreditCard className={cn('w-4 h-4 flex-shrink-0', canWallet ? 'text-success' : 'text-amber-500')} />
              <span className={canWallet ? 'text-success' : 'text-amber-600'}>
                Wallet balance: <strong>${balance.toFixed(2)}</strong>
                {canWallet ? ' — enough to cover this order' : ` — $${(total - balance).toFixed(2)} short`}
              </span>
            </div>

            {/* Checkout button */}
            <Button
              onClick={() => setShowCheckout(true)}
              className="w-full h-14 bg-gradient-cobalt hover:opacity-90 text-primary-foreground font-bold rounded-2xl gap-2 shadow-xl shadow-cobalt/20"
            >
              <ShoppingCart className="w-5 h-5" /> Proceed to Checkout
            </Button>
          </>
        )}
      </div>

      {/* Checkout dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Choose Payment Method</DialogTitle>
            <DialogDescription>
              Total to pay: <strong>${total.toFixed(2)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Wallet option */}
            <button
              onClick={() => setPayMethod('wallet')}
              disabled={!canWallet}
              className={cn(
                'w-full p-4 rounded-xl border-2 text-left transition-all',
                payMethod === 'wallet' && canWallet
                  ? 'border-cobalt-light bg-cobalt-light/5'
                  : canWallet
                  ? 'border-border hover:border-cobalt-light/50'
                  : 'border-border opacity-40 cursor-not-allowed',
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center',
                  payMethod === 'wallet' && canWallet ? 'bg-cobalt-light/10' : 'bg-secondary',
                )}>
                  <CreditCard className={cn('w-5 h-5', payMethod === 'wallet' && canWallet ? 'text-cobalt-light' : 'text-muted-foreground')} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">MyPal Wallet</p>
                  <p className="text-xs text-muted-foreground">
                    Balance: ${balance.toFixed(2)} {!canWallet && '(insufficient)'}
                  </p>
                </div>
                {payMethod === 'wallet' && canWallet && (
                  <div className="ml-auto w-5 h-5 rounded-full bg-cobalt-light flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </div>
            </button>

            {/* COD option */}
            <button
              onClick={() => setPayMethod('cod')}
              className={cn(
                'w-full p-4 rounded-xl border-2 text-left transition-all',
                payMethod === 'cod'
                  ? 'border-cobalt-light bg-cobalt-light/5'
                  : 'border-border hover:border-cobalt-light/50',
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center',
                  payMethod === 'cod' ? 'bg-cobalt-light/10' : 'bg-secondary',
                )}>
                  <Banknote className={cn('w-5 h-5', payMethod === 'cod' ? 'text-cobalt-light' : 'text-muted-foreground')} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Cash on Delivery</p>
                  <p className="text-xs text-muted-foreground">Pay when your order arrives</p>
                </div>
                {payMethod === 'cod' && (
                  <div className="ml-auto w-5 h-5 rounded-full bg-cobalt-light flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </div>
            </button>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCheckout(false)} disabled={ordering}>
              Cancel
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={ordering || (payMethod === 'wallet' && !canWallet)}
              className="bg-gradient-cobalt flex-1"
            >
              {ordering ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Placing order…</>
              ) : (
                <>Place Order · ${total.toFixed(2)}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

// ── Cart item row ─────────────────────────────────────────────────────────────

const CartItemRow = ({
  item, removing, onRemove,
}: { item: CartItem; removing: boolean; onRemove: () => void }) => {
  const name  = item.product?.name ?? 'Product';
  const price = Number(item.product?.current_price ?? 0);
  const qty   = item.quantity ?? 1;

  return (
    <div className="glass-card p-3 flex gap-3 items-start">
      <div className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-secondary">
        <ProductImage
          src={undefined}
          alt={name}
          width={160}
          height={160}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Package className="w-7 h-7 text-muted-foreground/40" />
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{name}</p>
        {item.product?.category && (
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.product.category}</p>
        )}
        <div className="flex items-center justify-between mt-2">
          <div>
            <p className="text-base font-bold text-cobalt-light">${(price * qty).toFixed(2)}</p>
            {qty > 1 && (
              <p className="text-[10px] text-muted-foreground">${price.toFixed(2)} each × {qty}</p>
            )}
          </div>

          <button
            onClick={onRemove}
            disabled={removing}
            className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label="Remove item"
          >
            {removing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CartScreen;
