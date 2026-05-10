import { useEffect, useRef, useState } from "react";
import { ContextSidebar } from "@/components/layout/ContextSidebar";
import { CommandHeader } from "@/components/layout/CommandHeader";
import { ProductResultCard } from "@/components/search/ProductResultCard";
import { ProductPreviewDrawer } from "@/components/search/ProductPreviewDrawer";
import { StatusConsole } from "@/components/search/StatusConsole";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/authStore";
import { useSearchStore } from "@/stores/searchStore";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Info, XCircle } from "lucide-react";

const DashboardScreen = () => {
  const [collapsed, setCollapsed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { 
    mode, 
    query, 
    isSearching, 
    results, 
    consoleLogs, 
    selectedResult, 
    setMode, 
    setQuery, 
    runSearch, 
    clearSearch, 
    cancelSearch, 
    selectResult 
  } = useSearchStore();
  const { persona, logout } = useAuthStore();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        selectResult(null);
        if (!selectedResult) clearSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSearch, selectResult, selectedResult]);

  return (
    <div className="flex min-h-screen bg-slate-50/50">
      <ContextSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} persona={persona} />
      
      <div className="flex flex-1 flex-col overflow-hidden">
        <CommandHeader
          searchRef={searchRef}
          query={query}
          mode={mode}
          onModeChange={setMode}
          onQueryChange={setQuery}
          onSubmit={runSearch}
          onLogout={logout}
        />
        
        <main className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="mx-auto w-full max-w-[1600px] px-8 py-8">
            <header className="mb-10 flex items-end justify-between">
              <div className="space-y-1">
                <h1 className="text-3xl font-black tracking-tight text-slate-900">
                  {isSearching ? "Orchestrating Search..." : "Discovery Workspace"}
                </h1>
                <p className="text-sm font-medium text-slate-500">
                  {results.length > 0 ? `Found ${results.length} synthesized matches` : "Enter a query to begin agentic exploration"}
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Info className="h-3 w-3" />
                  Keyboard shortcuts active
                </div>
                {isSearching && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={cancelSearch}
                    className="h-8 rounded-full px-4 text-[10px] font-black uppercase tracking-widest"
                  >
                    <XCircle className="mr-2 h-3.5 w-3.5" />
                    Terminate
                  </Button>
                )}
              </div>
            </header>

            <AnimatePresence mode="wait">
              {mode === "global" && isSearching && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="mb-8"
                >
                  <StatusConsole logs={consoleLogs} />
                </motion.div>
              )}
            </AnimatePresence>

            {results.length === 0 && !isSearching ? (
              <div className="flex h-[400px] w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white/50 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Search className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">No active search session</h3>
                <p className="mt-1 max-w-[280px] text-sm font-medium text-slate-500">
                  Type something in the command bar and press Enter to start.
                </p>
              </div>
            ) : (
              <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {isSearching && results.length === 0
                  ? Array.from({ length: 8 }).map((_, idx) => (
                      <div key={idx} className="space-y-4">
                        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-2/3" />
                          <Skeleton className="h-4 w-full" />
                        </div>
                      </div>
                    ))
                  : results.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <ProductResultCard item={item} onSelect={() => selectResult(item)} />
                      </motion.div>
                    ))}
              </section>
            )}
          </div>
        </main>
      </div>
      
      <ProductPreviewDrawer item={selectedResult} onClose={() => selectResult(null)} />
    </div>
  );
};

export default DashboardScreen;
