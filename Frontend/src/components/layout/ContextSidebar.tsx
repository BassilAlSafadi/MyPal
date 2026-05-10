import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Target, 
  Layers, 
  Bookmark, 
  Cpu, 
  BrainCircuit,
  Hash,
  ArrowUpRight
} from "lucide-react";
import type { PersonaProfile } from "@/stores/authStore";
import { cn } from "@/lib/utils";

interface ContextSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  persona: PersonaProfile | null;
}

export const ContextSidebar = ({ collapsed, onToggle, persona }: ContextSidebarProps) => (
  <motion.aside
    animate={{ width: collapsed ? 80 : 300 }}
    transition={{ type: "spring", stiffness: 300, damping: 30 }}
    className="sticky top-0 h-screen flex-shrink-0 overflow-hidden border-r bg-slate-50/50 backdrop-blur-xl z-30"
  >
    <div className="flex h-full flex-col px-4 py-6">
      <div className="mb-8 flex items-center justify-between">
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-2"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-white">
                <BrainCircuit className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-900">Intelligence</p>
            </motion.div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white mx-auto">
              <BrainCircuit className="h-5 w-5" />
            </div>
          )}
        </AnimatePresence>
        
        {!collapsed && (
          <Button size="icon" variant="ghost" onClick={onToggle} className="h-8 w-8 rounded-full hover:bg-slate-200">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-8 overflow-y-auto scrollbar-hide">
        {/* Persona Segment */}
        <div className="space-y-4">
          {!collapsed && (
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Persona</p>
              <Target className="h-3 w-3 text-slate-400" />
            </div>
          )}
          <div className="space-y-1.5">
            {(persona?.interests ?? []).map((item) => (
              <motion.div 
                key={item} 
                whileHover={{ x: 4 }}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium transition-all hover:bg-white hover:border-slate-200 hover:shadow-sm cursor-pointer",
                  collapsed ? "justify-center px-0" : "text-slate-600 hover:text-slate-900"
                )}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-200 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                  <Hash className="h-3 w-3" />
                </div>
                {!collapsed && <span>{item}</span>}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Categories / Filters */}
        <div className="space-y-4">
          {!collapsed && (
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Search Filters</p>
              <Layers className="h-3 w-3 text-slate-400" />
            </div>
          )}
          <div className="space-y-1.5">
            {["Recent Search", "Price Alerts", "Direct Sources"].map((item) => (
              <motion.div 
                key={item} 
                whileHover={{ x: 4 }}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium transition-all hover:bg-white hover:border-slate-200 hover:shadow-sm cursor-pointer",
                  collapsed ? "justify-center px-0" : "text-slate-600 hover:text-slate-900"
                )}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-200 text-slate-500 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                  <Bookmark className="h-3 w-3" />
                </div>
                {!collapsed && <span>{item}</span>}
              </motion.div>
            ))}
          </div>
        </div>

        {/* AI Memory Segments */}
        {!collapsed && (
          <div className="rounded-2xl bg-slate-950 p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="h-3.5 w-3.5 text-blue-400" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-white">Memory State</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                  <span>Context Depth</span>
                  <span className="text-blue-400">High</span>
                </div>
                <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full w-4/5 bg-blue-500" />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] font-bold text-slate-400">Tokens Optimized</span>
                <span className="text-[10px] font-mono text-slate-300 tracking-tighter">12.4k</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto pt-6">
        {collapsed ? (
          <Button size="icon" variant="outline" onClick={onToggle} className="h-10 w-10 rounded-xl border-slate-200 mx-auto">
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" className="w-full justify-between h-11 rounded-xl border-slate-200 text-slate-600 font-bold px-4">
            Workspace Settings
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  </motion.aside>
);
