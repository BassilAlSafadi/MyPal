import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchResult } from "@/stores/searchStore";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  ShoppingCart,
  ShieldCheck,
  Sparkles,
  Database,
  Globe,
  ArrowRight,
  MessageSquare,
  Send,
  Loader2,
  FileText,
  Languages,
} from "lucide-react";
import SellerAttitudeReport from "./Support/SellerAttitudeReport";
import { LinkThumb } from "@/components/LinkThumb";
import { useMockStore } from "@/lib/useMockStore";
import { cartService } from "@/services/cartService";
import { searchService } from "@/services/searchService";
import { toast } from "sonner";
import ProductImage from "@/components/ProductImage";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/utils";

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

// ── Device locale → readable language name (e.g. "ar-EG" -> "Arabic") ────────
function getDeviceLanguage(): { code: string; name: string } {
  const locale = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  const code = locale.split('-')[0];
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'language' });
    return { code, name: displayNames.of(code) || code };
  } catch {
    return { code, name: code };
  }
}

function buildProductData(product: ProductPreview, sellerName: string): Record<string, unknown> {
  return {
    name: product.title,
    price: product.price,
    category: product.category,
    condition: product.condition,
    seller: sellerName,
    description: product.description,
    specs: product.specs,
  };
}

// ── Product Copilot — three AI actions scoped to this specific product ───────
// Ask AI (multi-turn chat), Summarize, and Translate — all backed by Gemini Flash.
const ProductCopilot = ({ product }: { product: ProductPreview }) => {
  const [chatOpen, setChatOpen] = React.useState(false);

  const [summary, setSummary] = React.useState('');
  const [summaryBusy, setSummaryBusy] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState('');

  const [translation, setTranslation] = React.useState('');
  const [translateBusy, setTranslateBusy] = React.useState(false);
  const [translateError, setTranslateError] = React.useState('');

  const description = product.description?.trim() || '';
  const deviceLang = React.useMemo(getDeviceLanguage, []);

  const handleSummarize = async () => {
    if (summaryBusy || !description) return;
    setSummaryBusy(true); setSummaryError(''); setSummary('');
    try {
      const result = await searchService.summarizeProductDescription(description);
      if (result) setSummary(result);
      else setSummaryError('AI is temporarily unavailable. Please try again in a moment.');
    } catch (e: any) {
      setSummaryError(e?.message || 'Could not summarize. Please try again.');
    } finally {
      setSummaryBusy(false);
    }
  };

  const handleTranslate = async () => {
    if (translateBusy || !description) return;
    setTranslateBusy(true); setTranslateError(''); setTranslation('');
    try {
      const result = await searchService.translateProductDescription(description, deviceLang.name);
      if (result) setTranslation(result);
      else setTranslateError('AI is temporarily unavailable. Please try again in a moment.');
    } catch (e: any) {
      setTranslateError(e?.message || 'Could not translate. Please try again.');
    } finally {
      setTranslateBusy(false);
    }
  };

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-cobalt">
        <Sparkles className="w-4 h-4" />
        <span className="text-[10px] font-black uppercase tracking-widest">Product Copilot</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setChatOpen(true)}
          className="h-11 rounded-xl gap-1.5 text-[11px] font-bold px-1"
        >
          <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" /> Ask AI
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleSummarize}
          disabled={summaryBusy || !description}
          className="h-11 rounded-xl gap-1.5 text-[11px] font-bold px-1"
        >
          {summaryBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> : <FileText className="w-3.5 h-3.5 flex-shrink-0" />}
          Summarize
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleTranslate}
          disabled={translateBusy || !description}
          className="h-11 rounded-xl gap-1.5 text-[11px] font-bold px-1"
        >
          {translateBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> : <Languages className="w-3.5 h-3.5 flex-shrink-0" />}
          Translate
        </Button>
      </div>

      {summaryError && <p className="text-xs text-destructive">{summaryError}</p>}
      {summary && (
        <div className="rounded-xl bg-cobalt-light/[0.04] border border-cobalt-light/10 p-3 space-y-1">
          <p className="text-[9px] font-bold text-cobalt-light uppercase tracking-widest">Summary</p>
          <Markdown content={summary} size="sm" />
        </div>
      )}

      {translateError && <p className="text-xs text-destructive">{translateError}</p>}
      {translation && (
        <div className="rounded-xl bg-cobalt-light/[0.04] border border-cobalt-light/10 p-3 space-y-1">
          <p className="text-[9px] font-bold text-cobalt-light uppercase tracking-widest">{deviceLang.name} translation</p>
          <Markdown content={translation} size="sm" />
        </div>
      )}

      <ProductChatModal product={product} open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
};

// ── Ask AI chat window — multi-turn, RAG-grounded on this product's data ─────
interface ProductChatMessage { id: string; role: 'user' | 'assistant'; content: string }

const ProductChatModal = ({
  product, open, onClose,
}: { product: ProductPreview; open: boolean; onClose: () => void }) => {
  const [messages, setMessages] = React.useState<ProductChatMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  const sellerName = typeof product.seller === 'string'
    ? product.seller
    : product.seller?.name ?? 'MyPal';

  React.useEffect(() => {
    if (open) setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [messages, open, busy]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: q }]);
    setBusy(true);
    try {
      const history = messages.map(({ role, content }) => ({ role, content }));
      const productData = buildProductData(product, sellerName);
      const out = await searchService.askAboutProduct(q, productData, undefined, history);
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant',
        content: out || "I couldn't find an answer for that in this product's data.",
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant', content: 'Something went wrong. Please try again.',
      }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[calc(100%-2rem)] p-0 overflow-hidden rounded-2xl gap-0">
        <DialogHeader className="px-4 py-3 bg-gradient-cobalt space-y-0">
          <DialogTitle className="text-white text-sm font-bold flex items-center gap-2 text-left">
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Ask about {product.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="h-[50vh] overflow-y-auto p-4 space-y-3 bg-background/50">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center px-4">
              <p className="text-xs text-muted-foreground">
                Ask anything about this product — specs, fit, comparisons. Answers are grounded in this listing's data.
              </p>
            </div>
          ) : messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-gradient-cobalt text-white rounded-br-sm'
                  : 'bg-secondary rounded-bl-sm',
              )}>
                {m.role === 'user' ? m.content : <Markdown content={m.content} size="sm" />}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-secondary px-3.5 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-cobalt-light animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-cobalt-light animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-cobalt-light animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="p-3 border-t border-border/50 flex items-center gap-2 flex-shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="e.g. Is this good for daily use?"
            disabled={busy}
            className="flex-1 h-10 rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground bg-secondary/40 border border-border focus:outline-none focus:ring-1 focus:ring-cobalt-light/30 disabled:opacity-50"
          />
          <Button onClick={send} disabled={busy || !input.trim()} className="bg-gradient-cobalt px-4 h-10 flex-shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const ProductPreviewDrawer = ({ product, isOpen, onClose }: ProductPreviewDrawerProps) => {
  const navigate = useNavigate();
  const { addToCart } = useMockStore();
  const [isAddingToCart, setIsAddingToCart] = React.useState(false);

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

  // Add to cart → then navigate to /cart for checkout
  const handleAddToCart = async () => {
    setIsAddingToCart(true);
    try {
      if (hasCatalogId) {
        await cartService.addItem(product.id, 1);
      }
      addToCart(product.id, 1);
      toast.success('Added to cart!', {
        description: `${product.title} is in your cart.`,
        action: {
          label: 'View Cart',
          onClick: () => { onClose(); navigate('/cart'); },
        },
      });
    } catch (error) {
      toast.error('Could not add to cart', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Buy Now → add to cart then go straight to cart/checkout
  const handleBuyNow = async () => {
    setIsAddingToCart(true);
    try {
      if (hasCatalogId) {
        await cartService.addItem(product.id, 1);
      }
      addToCart(product.id, 1);
      onClose();
      navigate('/cart');
    } catch (error) {
      toast.error('Could not add item', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
        <div className="flex flex-col h-full">
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

            {/* Product Description */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</h3>
              <p className="ai-response-copy-sm text-muted-foreground">{description}</p>
            </div>

            {product.specs && Object.keys(product.specs).length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Specs</h3>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(product.specs).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 border border-border/50 px-3 py-2">
                      <span className="text-xs font-bold text-muted-foreground">{label}</span>
                      <span className="text-xs font-semibold text-foreground text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Product Copilot — ask AI about this specific product */}
            <ProductCopilot product={product} />

            {/* Seller Attitude Report (if available) */}
            <div className="mt-4">
              <SellerAttitudeReport sellerId={sellerName} />
            </div>

            {/* Details List */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-1">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Condition</p>
                <p className="text-sm font-bold text-foreground capitalize">{condition}</p>
              </div>
              <div className="glass-card p-4 space-y-1">
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
                    disabled={isAddingToCart}
                    className="w-full h-14 bg-gradient-cobalt hover:opacity-90 text-primary-foreground font-bold rounded-2xl gap-3 shadow-xl shadow-cobalt/20"
                  >
                    <ArrowRight className="w-5 h-5" /> {isAddingToCart ? 'Adding…' : 'Buy Now → Checkout'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleAddToCart}
                    disabled={isAddingToCart}
                    className="w-full h-12 rounded-2xl gap-3 font-bold"
                  >
                    <ShoppingCart className="w-4 h-4" /> {isAddingToCart ? 'Adding…' : 'Add to Cart'}
                  </Button>
                </div>
              ) : (
                <Button 
                  onClick={() => externalUrl && window.open(externalUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!externalUrl}
                  className="w-full h-14 bg-foreground text-background hover:opacity-90 font-bold rounded-2xl gap-3 shadow-xl"
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
