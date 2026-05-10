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
  Info, 
  Sparkles,
  Database,
  Globe
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductPreviewDrawerProps {
  product: SearchResult | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProductPreviewDrawer = ({ product, isOpen, onClose }: ProductPreviewDrawerProps) => {
  if (!product) return null;

  const isInternal = product.source === 'marketplace';

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
        <div className="flex flex-col h-full bg-slate-50/50">
          {/* Header Image */}
          <div className="relative aspect-video bg-secondary">
            <img 
              src={product.image} 
              alt={product.title} 
              className="w-full h-full object-cover"
            />
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
                    {product.seller} {product.url && <ExternalLink className="w-3 h-3" />}
                  </SheetDescription>
                </SheetHeader>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-foreground">
                  ${product.price.toLocaleString()}
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
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {isInternal 
                  ? "Verified internal listing. This item is ready for direct pickup or standard MyPal delivery. Inspection report indicates 98% quality match."
                  : "External match discovered via web agent. Price verified across 4 retailers. Significant savings identified compared to local retail average."}
              </p>
            </div>

            {/* Details List */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-1 bg-white">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Condition</p>
                <p className="text-sm font-bold text-foreground">Like New</p>
              </div>
              <div className="glass-card p-4 space-y-1 bg-white">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Delivery</p>
                <p className="text-sm font-bold text-foreground">2-3 Business Days</p>
              </div>
            </div>

            {/* CTAs */}
            <div className="space-y-3 pt-4">
              {isInternal ? (
                <Button className="w-full h-14 bg-gradient-cobalt hover:opacity-90 text-primary-foreground font-bold rounded-2xl gap-3 shadow-xl shadow-cobalt/20">
                  <ShoppingCart className="w-5 h-5" /> Direct Purchase
                </Button>
              ) : (
                <Button 
                  onClick={() => product.url && window.open(product.url, '_blank')}
                  className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-primary-foreground font-bold rounded-2xl gap-3 shadow-xl"
                >
                  <ExternalLink className="w-5 h-5" /> Visit {product.seller}
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
