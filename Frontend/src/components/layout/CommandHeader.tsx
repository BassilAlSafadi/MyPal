import { Search, Settings, LogOut, Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchMode } from "@/stores/searchStore";
import type { RefObject } from "react";
import { cn } from "@/lib/utils";

interface CommandHeaderProps {
  searchRef: RefObject<HTMLInputElement>;
  query: string;
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onLogout: () => void;
}

export const CommandHeader = ({
  searchRef,
  query,
  mode,
  onModeChange,
  onQueryChange,
  onSubmit,
  onLogout,
}: CommandHeaderProps) => (
  <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur-md">
    <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-6 px-6">
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white">
          <Command className="h-4 w-4" />
        </div>
        <span className="hidden lg:inline">MyPal</span>
      </div>

      <div className="relative flex flex-1 items-center">
        <div className="flex w-full max-w-2xl items-center gap-3 rounded-xl border bg-slate-50/50 px-4 transition-all focus-within:border-slate-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-slate-100">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="Search products, sources, or intents..."
            className="h-11 w-full border-none bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
          />
          <div className="hidden items-center gap-1 rounded border bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:flex">
            <span>/</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center rounded-lg border bg-slate-50 p-1 sm:flex">
          <button
            onClick={() => onModeChange("internal")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              mode === "internal" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Internal
          </button>
          <button
            onClick={() => onModeChange("global")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              mode === "global" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Agentic
          </button>
        </div>

        <div className="h-4 w-[1px] bg-slate-200" />

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500">
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onLogout} className="h-9 w-9 text-slate-500 hover:text-red-600">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  </header>
);
