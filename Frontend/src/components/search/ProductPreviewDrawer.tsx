import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { SearchResult } from "@/stores/searchStore";
import { X, ExternalLink, ShoppingCart, ShieldCheck, Globe, Clock, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ProductPreviewDrawerProps {
  item: SearchResult | null;
  onClose: () => void;
}

export const ProductPreviewDrawer = ({ item, onClose }: ProductPreviewDrawerProps) => (
  <AnimatePresence>
    {item ? (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-md"
        />
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed right-0 top-0 z-50 h-screen w-full max-w-xl border-l bg-white shadow-2xl"
        >
          <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-3">
                <Badge 
                  className={cn(
                    "flex items-center gap-1.5 border-none px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase",
                    item.source === "internal" ? "bg-slate-900 text-white" : "bg-blue-600 text-white"
                  )}
                >
                  {item.source === "internal" ? <ShieldCheck className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                  {item.badge}
                </Badge>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">{item.sourceName}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </Button>
            </header>

            <div className="flex-1 overflow-y-auto scrollbar-hide">
              <div className="p-6 space-y-8">
                <div className="relative group">
                  <img src={item.image} alt={item.title} className="aspect-[16/10] w-full rounded-2xl object-cover shadow-lg" />
                  <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10" />
                </div>

                <div className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">{item.title}</h2>
                    <span className="text-2xl font-black text-slate-900">${item.price}</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 py-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{item.freshness}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{item.trustLabel}</span>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl bg-slate-50 p-5 border border-slate-100">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-widest">
                      <BarChart3 className="h-3.5 w-3.5" />
                      AI Synthesized Insights
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600 font-medium">
                      {item.summary}
                    </p>
                    <div className="pt-2">
                      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: "85%" }}
                          className="h-full bg-blue-600 rounded-full"
                        />
                      </div>
                      <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase">Contextual match: 85%</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Source Metadata</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border p-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Origin</p>
                      <p className="mt-1 text-xs font-bold text-slate-900">{item.sourceName}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Verification</p>
                      <p className="mt-1 text-xs font-bold text-slate-900">{item.trustLabel}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer className="border-t bg-slate-50/50 p-6">
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} className="h-12 flex-1 rounded-xl font-bold border-slate-200">
                  Dismiss
                </Button>
                <Button className="h-12 flex-[2] rounded-xl font-bold bg-slate-950 hover:bg-slate-800" asChild>
                  <a href={item.destinationUrl ?? "#"} target={item.destinationUrl ? "_blank" : undefined} rel="noreferrer">
                    {item.source === "internal" ? (
                      <>
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Complete Purchase
                      </>
                    ) : (
                      <>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View External Source
                      </>
                    )}
                  </a>
                </Button>
              </div>
            </footer>
          </div>
        </motion.aside>
      </>
    ) : null}
  </AnimatePresence>
);
