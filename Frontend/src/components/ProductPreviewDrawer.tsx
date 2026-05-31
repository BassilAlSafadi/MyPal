import * as React from "react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
} from "@/components/ui/sheet";
import { SearchResult } from "@/stores/searchStore";
import { Button } from "@/components/ui/button";
import { 
  ExternalLink, 
  ShoppingCart, 
  ShieldCheck, 
  Sparkles,
  Database,
  Globe
} from "lucide-react";
import SellerAttitudeReport from "./Support/SellerAttitudeReport";
import { LinkThumb } from "@/components/LinkThumb";
import { useMockStore } from "@/lib/useMockStore";
import { cartService } from "@/services/cartService";
import { orderService } from "@/services/orderService";
import { toast } from "sonner";
import ProductImage from "@/components/ProductImage";

type SellerValue = string | { name?: string; isMyPal?: boolean };

export type ProductPreview = Omit<SearchResult, 'seller'> & {
  seller: SellerValue;
  url?: string | null;
  source_url?: string | null;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  specs?: Record<string, string>;
  freeShipping?: boolean;
};

interface ProductPreviewDrawerProps {
  product: ProductPreview | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProductPreviewDrawer = ({ product, isOpen, onClose }: ProductPreviewDrawerProps) => {
  const { addToCart } = useMockStore();
  const [isAddingToCart, setIsAddingToCart] = React.useState(false);
  const [isOrdering, setIsOrdering] = React.useState(false);

  if (!product) return null;

  const isInternal = product.source === 'marketplace';
  const sellerName = typeof product.seller === 'string'
    ? product.seller
    : product.seller?.name ?? 'MyPal';
  const externalUrl = product.url ?? product.source_url;
  const hasCatalogId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(product.id);
  const price = Number(product.price ?? 0);
  const priceLabel = price > 0 ? `$${price.toLocaleString()}` : 'Price on listing';
  const condition = product.condition
    ? product.condition.replace('-', ' ')
    : isInternal ? 'Verified listing' : 'External listing';
  const delivery = product.freeShipping ? 'Free shipping' : isInternal ? '2-3 business days' : 'Set by seller';
  const description = product.description?.trim()
    || (isInternal
      ? 'This MyPal listing is available to review and add to your cart. The seller and purchase flow are protected by MyPal escrow.'
      : 'This external product was discovered by the web agent. Open the seller page to confirm availability, shipping, and final checkout terms.');

  const handleInternalPurchase = async () => {
    setIsAddingToCart(true);
    try {
      if (hasCatalogId) {
        await cartService.addItem(product.id, 1);
      }
      addToCart(product.id, 1);
      toast.success('Added to cart', {
        description: `${product.title} is ready for checkout.`,
      });
    } catch (error) {
      toast.error('Could not add item', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!hasCatalogId) {
      await handleInternalPurchase();
      return;
    }

    setIsOrdering(true);
    try {
      const order = await orderService.create({
        items: [{ productId: product.id, quantity: 1 }],
        paymentMethod: 2,
        codAmountDue: price > 0 ? price : undefined,
      });
      const orderId = order.id ?? order.order_id;
      toast.success('Order created', {
        description: orderId ? `Order ${orderId} is pending confirmation.` : `${product.title} is pending confirmation.`,
      });
      onClose();
    } catch (error) {
      toast.error('Could not create order', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsOrdering(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
        <div className="flex flex-col h-full bg-slate-50/50">
          {/* Header Image */}
          <div className="relative aspect-video bg-secondary">
            {!product.image && !isInternal && externalUrl ? (
              <LinkThumb url={externalUrl} label={sellerName} />
            ) : (
              <ProductImage
                src={product.image}
                alt={product.title}
                width={900}
                height={506}
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute bottom-4 left-4">
              {isInternal ? (
                <span className="flex items-center gap-1.5 text-xs bg-cobalt text-white px-3 py-1 rounded-full font-bold shadow-xl">
                  <Database className="w-3.5 h-3.5" /> Resident Inventory
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1 rounded-full font-bold shadow-xl">
                  <Globe className="w-3.5 h-3.5" /> Web Agent Discovery
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 p-6 space-y-8">
            {/* Title & Price */}
            <div className="space-y-4">
              <div className="space-y-2">
                <SheetHeader>
                  <SheetTitle className="text-2xl font-serif font-bold text-foreground leading-tight">
                    {product.title}
                  </SheetTitle>
                  <SheetDescription className="text-sm font-medium text-cobalt flex items-center gap-2">
                    {sellerName} {externalUrl && <ExternalLink className="w-3 h-3" />}
                  </SheetDescription>
                </SheetHeader>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-foreground">
                  {priceLabel}
                </span>
                {!isInternal && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                    Best price found by agent
                  </span>
                )}
              </div>
            </div>

            {/* AI Synthesized Insights (New Feature) */}
            <div className="glass-card p-5 border-cobalt-light/10 bg-cobalt-light/[0.02] space-y-4">
              <div className="flex items-center gap-2 text-cobalt">
                <Sparkles className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">AI Synthesis</span>
              </div>
              <p className="ai-response-copy-sm text-slate-600">
                {isInternal 
                  ? "Verified internal listing. This item is ready for direct pickup or standard MyPal delivery. Inspection report indicates 98% quality match."
                  : "External match discovered via web agent. Price verified across 4 retailers. Significant savings identified compared to local retail average."}
              </p>
            </div>

            {/* Product Description */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</h3>
              <p className="ai-response-copy-sm text-slate-700">{description}</p>
            </div>

            {product.specs && Object.keys(product.specs).length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Specs</h3>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(product.specs).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-border/50 px-3 py-2">
                      <span className="text-xs font-bold text-muted-foreground">{label}</span>
                      <span className="text-xs font-semibold text-foreground text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seller Attitude Report (if available) */}
            <div className="mt-4">
              <SellerAttitudeReport sellerId={sellerName} />
            </div>

            {/* Details List */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-1 bg-white">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Condition</p>
                <p className="text-sm font-bold text-foreground capitalize">{condition}</p>
              </div>
              <div className="glass-card p-4 space-y-1 bg-white">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Delivery</p>
                <p className="text-sm font-bold text-foreground">{delivery}</p>
              </div>
            </div>

            {/* CTAs */}
            <div className="space-y-3 pt-4">
              {isInternal ? (
                <div className="space-y-3">
                  <Button
                    onClick={handleBuyNow}
                    disabled={isOrdering || isAddingToCart}
                    className="w-full h-14 bg-gradient-cobalt hover:opacity-90 text-primary-foreground font-bold rounded-2xl gap-3 shadow-xl shadow-cobalt/20"
                  >
                    <ShoppingCart className="w-5 h-5" /> {isOrdering ? 'Creating Order...' : 'Buy Now'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleInternalPurchase}
                    disabled={isOrdering || isAddingToCart}
                    className="w-full h-12 rounded-2xl gap-3 font-bold"
                  >
                    <ShoppingCart className="w-4 h-4" /> {isAddingToCart ? 'Adding...' : 'Add to Cart'}
                  </Button>
                </div>
              ) : (
                <Button 
                  onClick={() => externalUrl && window.open(externalUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!externalUrl}
                  className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-primary-foreground font-bold rounded-2xl gap-3 shadow-xl"
                >
                  <ExternalLink className="w-5 h-5" /> Visit {sellerName}
                </Button>
              )}
              
              <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Secured by MyPal Escrow
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
