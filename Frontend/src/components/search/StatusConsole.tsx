import { motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Activity, ChevronRight } from "lucide-react";

interface StatusConsoleProps {
  logs: string[];
}

export const StatusConsole = ({ logs }: StatusConsoleProps) => {
  if (!logs.length) return null;
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Agentic Orchestration Console</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-emerald-500 animate-pulse flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Live Stream
          </span>
          <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
        </div>
      </div>
      
      <ScrollArea className="h-48 px-4 py-3">
        <div className="space-y-1.5 font-mono text-[11px] leading-relaxed">
          {logs.map((log, index) => (
            <motion.div
              key={`${log}-${index}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2"
            >
              <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" />
              <span className={index === logs.length - 1 ? "text-emerald-400 font-bold" : "text-slate-400"}>
                {log}
              </span>
            </motion.div>
          ))}
          <motion.div 
            animate={{ opacity: [1, 0] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className="h-3.5 w-1.5 bg-emerald-500 inline-block ml-1"
          />
        </div>
      </ScrollArea>
    </motion.div>
  );
};
