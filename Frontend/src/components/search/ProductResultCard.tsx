import { Badge } from "@/components/ui/badge";
import type { SearchResult } from "@/stores/searchStore";
import { cn } from "@/lib/utils";
import { ShoppingCart, ExternalLink, ShieldCheck, Globe } from "lucide-react";

interface ProductResultCardProps {
  item: SearchResult;
  onSelect: () => void;
}

export const ProductResultCard = ({ item, onSelect }: ProductResultCardProps) => (
  <article
    onClick={onSelect}
    className="group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition-all hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/50"
  >
    <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
      <img
        src={item.image}
        alt={item.title}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      
      <div className="absolute left-3 top-3 flex flex-col gap-2">
        <Badge 
          className={cn(
            "flex items-center gap-1.5 border-none px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase",
            item.source === "internal" ? "bg-slate-900 text-white" : "bg-blue-600 text-white"
          )}
        >
          {item.source === "internal" ? <ShieldCheck className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
          {item.badge}
        </Badge>
      </div>

      <div className="absolute bottom-3 right-3 translate-y-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg">
          {item.source === "internal" ? <ShoppingCart className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
        </div>
      </div>
    </div>

    <div className="flex flex-1 flex-col p-4">
      <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-slate-400 uppercase tracking-tight">
        <span>{item.sourceName}</span>
        <span>{item.freshness}</span>
      </div>
      
      <h3 className="line-clamp-1 text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
        {item.title}
      </h3>
      
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
        {item.summary}
      </p>

      <div className="mt-auto pt-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">Price</span>
          <span className="text-lg font-black text-slate-900">${item.price}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">Status</span>
          <span className="text-[11px] font-semibold text-emerald-600">{item.trustLabel}</span>
        </div>
      </div>
    </div>
  </article>
);
