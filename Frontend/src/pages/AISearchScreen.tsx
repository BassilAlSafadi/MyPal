import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Sparkles, Zap, ShoppingBag, ExternalLink, Globe,
  Check, Languages, FileText, MessageSquare, Star, BarChart3, Loader2,
  Plus, Trash2, ChevronDown, History, X, Clock, ChevronRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { cn } from '@/lib/utils';
import { searchService, SearchModel, ExternalProduct, ChatThread, ChatMessage, FeatureHistoryItem } from '@/services/searchService';
import { productService } from '@/services/productService';
import { useAsync } from '@/hooks/useAsync';
import { ProductPreviewDrawer, ProductPreview } from '@/components/ProductPreviewDrawer';
import ProductImage from '@/components/ProductImage';
import { LinkThumb } from '@/components/LinkThumb';
import { Markdown } from '@/components/Markdown';
import { normalizeChatMarkdown } from '@/lib/chatMarkdown';
import { PRODUCT_IMAGE_FALLBACK } from '@/lib/productImage';
import { toast } from 'sonner';

// ── Thinking steps — describe the process in plain language only.
// Deliberately no provider/model/API names so the user sees what's happening,
// not which services power it.

const FAST_THOUGHTS = [
  'Understanding your question...',
  'Searching the web and the MyPal catalog...',
  'Reviewing the best matches...',
  'Writing your answer...',
];

const PRO_THOUGHTS = [
  'Understanding your request...',
  'Checking the MyPal catalog...',
  'Planning a deeper search...',
  'Searching across the web...',
  'Gathering prices and details...',
  'Comparing the options...',
  'Verifying the findings...',
  'Double-checking accuracy and links...',
  'Putting together your answer...',
];

// ── Types ─────────────────────────────────────────────────────────────────────

type AIFeature = 'search' | 'translate' | 'summarize' | 'ask-product' | 'recommend' | 'sellers';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  model?: SearchModel;
  mypalProducts?: { id: string; title: string; category?: string; score?: number }[];
  products?: ExternalProduct[];
  suggestions?: string[];
  timestamp: Date;
}

interface Quota { used: number; limit: number; remaining: number; resets_at: string }

// ── Feature tab definitions ───────────────────────────────────────────────────

const TABS: { id: AIFeature; label: string; icon: React.ReactNode; short: string }[] = [
  { id: 'search',      label: 'AI Search',          icon: <Sparkles className="w-4 h-4" />,    short: 'Search' },
  { id: 'translate',   label: 'Translate',           icon: <Languages className="w-4 h-4" />,   short: 'Translate' },
  { id: 'summarize',   label: 'Summarize',           icon: <FileText className="w-4 h-4" />,    short: 'Summarize' },
  { id: 'ask-product', label: 'Ask Product',         icon: <MessageSquare className="w-4 h-4" />, short: 'Ask AI' },
  { id: 'recommend',   label: 'Recommendations',     icon: <Star className="w-4 h-4" />,        short: 'Recommend' },
  { id: 'sellers',     label: 'Seller Analytics',    icon: <BarChart3 className="w-4 h-4" />,   short: 'Sellers' },
];

const LANGUAGES = [
  'Arabic', 'French', 'German', 'Spanish', 'Italian', 'Japanese',
  'Korean', 'Portuguese', 'Russian', 'Turkish', 'Chinese (Simplified)',
  'Hindi', 'Dutch', 'Polish', 'Swedish',
];

// ── Main Component ─────────────────────────────────────────────────────────────

const AISearchScreen = () => {
  const [activeTab, setActiveTab] = useState<AIFeature>('search');

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-cobalt-light" />
          <h1 className="text-lg font-serif font-bold text-foreground">AI Hub</h1>
        </div>
        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border',
                activeTab === tab.id
                  ? 'bg-cobalt-light text-white border-cobalt-light shadow-sm'
                  : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30',
              )}
            >
              {tab.icon}
              {tab.short}
            </button>
          ))}
        </div>
      </div>

      {/* Feature panels */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'search'      && <SearchPanel />}
        {activeTab === 'translate'   && <TranslatePanel />}
        {activeTab === 'summarize'   && <SummarizePanel />}
        {activeTab === 'ask-product' && <AskProductPanel />}
        {activeTab === 'recommend'   && <RecommendPanel />}
        {activeTab === 'sellers'     && <SellerAnalyticsPanel />}
      </div>

      <BottomNav />
    </div>
  );
};

// ── helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function serverMsgToLocal(msg: ChatMessage, idx: number): Message {
  return {
    id: msg._id || `msg-${idx}`,
    type: msg.role === 'user' ? 'user' : 'ai',
    content: msg.content,
    model: msg.model,
    mypalProducts: Array.isArray(msg.internal_products) && msg.internal_products.length > 0
      ? msg.internal_products as { id: string; title: string; category?: string }[]
      : undefined,
    products: Array.isArray(msg.products) && msg.products.length > 0
      ? msg.products as ExternalProduct[]
      : undefined,
    suggestions: msg.role === 'assistant'
      ? ['Tell me more', 'Show cheaper alternatives', 'Compare options']
      : undefined,
    timestamp: new Date(msg.created_at || Date.now()),
  };
}

// ── Search Panel — LLM-app style chat with persistent threads ─────────────────

const SearchPanel = () => {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [isTyping, setIsTyping]     = useState(false);
  const [model, setModel]           = useState<SearchModel>('fast');
  const selectedModelRef            = useRef<SearchModel>('fast');
  const [selectedProduct, setSelectedProduct] = useState<ProductPreview | null>(null);
  const [visibleThoughts, setVisibleThoughts] = useState<string[]>([]);
  const thoughtTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);

  // Thread state
  const [threadId, setThreadId]           = useState<string | null>(null);
  const [threadTitle, setThreadTitle]     = useState('New chat');
  const [threadList, setThreadList]       = useState<ChatThread[]>([]);
  const [showThreads, setShowThreads]     = useState(false);
  const [threadListLoading, setThreadListLoading] = useState(false); // only for drawer
  const [switchingThread, setSwitchingThread]     = useState(false); // only for thread switch

  // Quota — server value + local optimistic counter
  const { data: quotaData, refetch: refetchQuota } = useAsync<Quota>(
    () => searchService.getDeepSearchQuota(), [],
  );
  const quota: Quota = quotaData ?? { used: 0, limit: 3, remaining: 3, resets_at: '' };
  const [proUsedLocal, setProUsedLocal] = useState(0);
  // Sync local counter whenever server data arrives
  // Only sync upward — never let a server response undo an optimistic increment
  useEffect(() => { if (quotaData) setProUsedLocal(prev => Math.max(prev, quotaData.used)); }, [quotaData]);
  const proRemaining = Math.max(0, quota.limit - proUsedLocal);
  const proQuotaFull = proRemaining <= 0;

  const selectModel = useCallback((m: SearchModel) => {
    if (m === 'pro' && proQuotaFull) {
      toast.info(`You've used all ${quota.limit} Pro searches today. Pro resets at midnight.`);
      return;
    }
    selectedModelRef.current = m;
    setModel(m);
  }, [proQuotaFull]);

  useEffect(() => { selectedModelRef.current = model; }, [model]);

  // If the Pro quota runs out while Pro is selected, fall back to Fast so the
  // user can't fire a Pro request that would be rejected (and waste tokens).
  useEffect(() => {
    if (proQuotaFull && model === 'pro') {
      setModel('fast');
      selectedModelRef.current = 'fast';
      toast.info('Pro quota finished — switched to Fast. Pro resets at midnight.');
    }
  }, [proQuotaFull, model]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  // Thinking animation
  useEffect(() => {
    if (thoughtTimerRef.current) clearInterval(thoughtTimerRef.current);
    if (!isTyping) { setVisibleThoughts([]); return; }
    const thoughts = model === 'pro' ? PRO_THOUGHTS : FAST_THOUGHTS;
    let idx = 0;
    setVisibleThoughts([thoughts[0]]);
    idx = 1;
    thoughtTimerRef.current = setInterval(() => {
      if (idx < thoughts.length) { setVisibleThoughts(p => [...p, thoughts[idx]].slice(-6)); idx++; }
    }, model === 'pro' ? 1800 : 1200);
    return () => { if (thoughtTimerRef.current) clearInterval(thoughtTimerRef.current); };
  }, [isTyping, model]);

  // Bootstrap threads silently in background — never blocks the input
  useEffect(() => {
    (async () => {
      try {
        const threads = await searchService.listThreads();
        setThreadList(threads);
        if (threads.length > 0) {
          // Silently pre-load most recent thread messages without blocking UI
          const thread = await searchService.getThread(threads[0]._id);
          setThreadId(thread._id);
          setThreadTitle(thread.title || 'New chat');
          setMessages((thread.messages || []).map(serverMsgToLocal));
        }
        // If no threads exist, leave threadId null — it will be created on first send
      } catch { /* non-fatal — user can still chat */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadThread(id: string, title: string) {
    setSwitchingThread(true);
    setShowThreads(false);
    setMessages([]); // clear immediately so user sees thread switching
    try {
      const thread = await searchService.getThread(id);
      setThreadId(thread._id);
      setThreadTitle(thread.title || 'New chat');
      setMessages((thread.messages || []).map(serverMsgToLocal));
    } catch { /* ignore */ }
    finally { setSwitchingThread(false); }
  }

  async function createNewThread() {
    setShowThreads(false);
    setMessages([]);
    setThreadTitle('New chat');
    setThreadId(null); // will be created on first send
  }

  // Called on first send when no thread exists yet
  async function ensureThread(): Promise<string | null> {
    if (threadId) return threadId;
    try {
      const thread = await searchService.createThread();
      setThreadList(prev => [thread, ...prev]);
      setThreadId(thread._id);
      return thread._id;
    } catch { return null; }
  }

  async function deleteThread(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await searchService.deleteThread(id);
      const updated = threadList.filter(t => t._id !== id);
      setThreadList(updated);
      if (id === threadId) {
        if (updated.length > 0) {
          await loadThread(updated[0]._id, updated[0].title);
        } else {
          await createNewThread();
        }
      }
    } catch { /* ignore */ }
  }

  const handleSend = async () => {
    const query = input.trim();
    let requestModel = selectedModelRef.current;
    if (!query || isTyping) return;

    // Pro quota exhausted: downgrade to Fast and notify, rather than firing a
    // Pro request that the backend would reject after burning the workflow.
    if (requestModel === 'pro' && proQuotaFull) {
      requestModel = 'fast';
      selectedModelRef.current = 'fast';
      setModel('fast');
      toast.info('Pro quota finished — running this with Fast instead. Pro resets at midnight.');
    }

    setMessages(p => [...p, {
      id: `u-${Date.now()}`, type: 'user', content: query,
      model: requestModel, timestamp: new Date(),
    }]);
    setInput('');
    setIsTyping(true);

    let internalResults: Awaited<ReturnType<typeof searchService.performInternalSearch>> = [];
    let internalPayload: Array<{ id: string; title: string; category?: string }> = [];

    try {
      internalResults = await searchService.performInternalSearch(query);
      internalPayload = internalResults.slice(0, 5).map(r => ({
        id: r.id, title: r.title, category: r.category,
      }));

      const activeThreadId = await ensureThread();
      if (!activeThreadId) throw new Error('Could not create thread');

      // Optimistic decrement so the counter drops immediately on send
      if (requestModel === 'pro') setProUsedLocal(n => n + 1);

      let { message, pending } = await searchService.sendThreadMessage(
        activeThreadId, query, requestModel, internalPayload,
      );

      // Auto-title on first message of a new chat
      if (threadTitle === 'New chat') {
        const newTitle = query.slice(0, 55);
        setThreadTitle(newTitle);
        setThreadList(prev => prev.map(t => t._id === activeThreadId ? { ...t, title: newTitle, updated_at: new Date().toISOString() } : t));
      }

      // Pro runs in the background — poll the thread until the answer is ready,
      // keeping the thinking animation visible the whole time.
      if (pending && message?._id) {
        const finished = await searchService.pollThreadMessage(activeThreadId, message._id);
        if (finished) message = finished;
      }

      const mypalProducts = (message.internal_products && message.internal_products.length > 0
        ? message.internal_products
        : internalPayload) as { id: string; title: string; category?: string }[];

      const fallback = internalResults.length > 0
        ? `Found ${internalResults.length} matching product${internalResults.length === 1 ? '' : 's'} in MyPal for "${query}".`
        : `No exact MyPal match for "${query}". Try Pro for a deeper web search.`;

      setMessages(p => [...p, {
        id: message._id || `a-${Date.now()}`,
        type: 'ai',
        content: message.content || fallback,
        model: requestModel,
        mypalProducts: mypalProducts.length > 0 ? mypalProducts : undefined,
        products: Array.isArray(message.products) && message.products.length > 0
          ? message.products as ExternalProduct[]
          : undefined,
        suggestions: ['Tell me more', 'Show cheaper alternatives', 'Compare options'],
        timestamp: new Date(message.created_at || Date.now()),
      }]);

      // Bubble thread to top of list
      setThreadList(prev => {
        const t = prev.find(x => x._id === activeThreadId);
        if (!t) return prev;
        return [{ ...t, updated_at: new Date().toISOString() }, ...prev.filter(x => x._id !== activeThreadId)];
      });
    } catch (err: any) {
      // Surface the daily Pro quota limit clearly instead of a generic failure.
      const status = err?.status;
      const messageText = String(err?.message || '');
      const isQuota = /quota/i.test(messageText) || /quota/i.test(String(err?.code || ''));

      if (!isQuota) {
        try {
          const fallbackModel: SearchModel = requestModel === 'pro' ? 'fast' : requestModel;
          if (requestModel === 'pro') {
            selectedModelRef.current = 'fast';
            setModel('fast');
            toast.info('Pro chat is temporarily busy - running this with Fast.');
          } else {
            toast.info('Chat history is temporarily busy - returning a one-off answer.');
          }

          const fallbackResult = await searchService.performAISearch(query, fallbackModel, internalResults);
          const fallbackText = fallbackResult.text || (
            internalResults.length > 0
              ? `Found ${internalResults.length} matching product${internalResults.length === 1 ? '' : 's'} in MyPal for "${query}".`
              : `No exact MyPal match for "${query}". Try again in a moment for a deeper search.`
          );

          setMessages(p => [...p, {
            id: `a-${Date.now()}`,
            type: 'ai',
            content: fallbackText,
            model: fallbackModel,
            mypalProducts: internalPayload.length > 0 ? internalPayload : undefined,
            products: fallbackResult.products.length > 0 ? fallbackResult.products : undefined,
            suggestions: ['Tell me more', 'Show cheaper alternatives', 'Compare options'],
            timestamp: new Date(),
          }]);
          return;
        } catch (fallbackErr: any) {
          const fallbackMessage = String(fallbackErr?.message || '');
          const isRateLimited = fallbackErr?.status === 429 || status === 429 || /rate limit/i.test(fallbackMessage) || /rate limit/i.test(messageText);
          const content = isRateLimited
            ? 'AI is temporarily rate-limited. Please try again in a minute.'
            : 'Search failed. Please try again in a moment.';
          setMessages(p => [...p, {
            id: `err-${Date.now()}`, type: 'ai', content,
            model: requestModel, timestamp: new Date(),
          }]);
          return;
        }
      }

      const content = isQuota
        ? `⚡ You've used all ${quota.limit} Pro searches for today. Pro resets at midnight — Fast search is still available.`
        : 'Search failed. Please try again in a moment.';
      setMessages(p => [...p, {
        id: `err-${Date.now()}`, type: 'ai', content,
        model: requestModel, timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const openMyPalProduct = async (product: { id: string; title: string; category?: string; score?: number }) => {
    const preview: ProductPreview = {
      id: product.id, title: product.title, price: 0,
      image: PRODUCT_IMAGE_FALLBACK, source: 'marketplace',
      seller: 'MyPal Verified', rating: product.score ?? 4.8,
      category: product.category,
      description: 'A matching MyPal catalog listing. Open it here to review details and add it to your cart.',
    };
    setSelectedProduct(preview);
    try {
      const full = await productService.get(product.id);
      setSelectedProduct({ ...full, source: 'marketplace', seller: full.seller ?? preview.seller });
    } catch { /* keep preview */ }
  };

  const openExternalProduct = (product: ExternalProduct, index: number, messageId: string) => {
    const price = Number(product.total_cost ?? product.price ?? 0);
    setSelectedProduct({
      id: `ext-${messageId}-${index}`,
      title: product.name ?? product.title ?? 'External product',
      price: Number.isFinite(price) ? price : 0,
      image: product.thumbnail ?? PRODUCT_IMAGE_FALLBACK,
      source: 'external', seller: product.source ?? 'External seller', rating: 4.6,
      url: product.source_url,
      description: product.key_specs?.length
        ? product.key_specs.join('\n')
        : 'External web finding. Open the seller page to verify price, stock, and shipping.',
    });
  };

  const canSend = input.trim().length > 0 && !isTyping && !(model === 'pro' && proQuotaFull);

  return (
    <div className="flex flex-col h-full relative bg-background">

      {/* ── Chat header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background/95 backdrop-blur-sm flex-shrink-0">
        <button
          onClick={() => setShowThreads(true)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Chat history"
        >
          <History className="w-4 h-4" />
        </button>
        <p className="flex-1 text-sm font-medium text-foreground truncate">{threadTitle}</p>
        <button
          onClick={createNewThread}
          className="flex items-center gap-1 text-xs text-cobalt-light hover:text-cobalt-light/80 font-medium px-2 py-1 rounded-lg hover:bg-cobalt-light/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {/* ── Thread history drawer ────────────────────────────────────────────── */}
      {showThreads && (
        <div className="absolute inset-0 z-30 flex" onClick={() => setShowThreads(false)}>
          {/* backdrop */}
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          {/* drawer */}
          <div
            className="relative z-10 w-72 max-w-[85vw] bg-background border-r border-border flex flex-col h-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Chat history</p>
              <button onClick={() => setShowThreads(false)} className="p-1 rounded-md text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={createNewThread}
              className="mx-3 mt-3 mb-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-cobalt-light/40 text-cobalt-light text-sm font-medium hover:bg-cobalt-light/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New chat
            </button>

            <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
              {threadListLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : threadList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No conversations yet</p>
              ) : threadList.map(t => (
                <button
                  key={t._id}
                  onClick={() => loadThread(t._id, t.title)}
                  className={cn(
                    'w-full flex items-start gap-2 px-3 py-2.5 rounded-xl text-left transition-colors group',
                    t._id === threadId
                      ? 'bg-cobalt-light/10 text-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate leading-tight">{t.title || 'New chat'}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(t.updated_at)}</p>
                  </div>
                  <button
                    onClick={e => deleteThread(t._id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Messages area ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {switchingThread ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-cobalt-light" />
          </div>
        ) : messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <div className="w-14 h-14 rounded-2xl bg-gradient-cobalt flex items-center justify-center mb-5 shadow-lg">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-serif font-bold text-foreground mb-1">Ask MyPal AI</h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-xs leading-relaxed">
              Search products, compare prices, get recommendations — Fast or Pro deep search.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {['Best laptop under $1,000', 'Wireless earbuds for running', 'Gift ideas for gamers'].map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border border-border hover:border-cobalt-light/40 hover:bg-cobalt-light/5 transition-all group"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-cobalt-light flex-shrink-0 transition-colors" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{s}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-6 space-y-6 max-w-3xl mx-auto px-4">
            {messages.map(msg => (
              <div key={msg.id} className={cn('flex gap-3', msg.type === 'user' ? 'justify-end' : 'justify-start items-start')}>

                {/* AI avatar */}
                {msg.type === 'ai' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-cobalt flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    {msg.model === 'pro'
                      ? <Sparkles className="w-3.5 h-3.5 text-white" />
                      : <Zap className="w-3.5 h-3.5 text-white" />
                    }
                  </div>
                )}

                <div className={cn('flex flex-col gap-3', msg.type === 'user' ? 'items-end max-w-[80%]' : 'items-start flex-1 min-w-0')}>
                  {/* model badge for AI */}
                  {msg.type === 'ai' && msg.model && (
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {msg.model === 'pro' ? 'Pro search' : 'Fast search'}
                    </span>
                  )}

                  {/* Bubble / content */}
                  {msg.type === 'user' ? (
                    <div className="bg-cobalt-light text-white px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="text-sm text-foreground leading-relaxed w-full">
                      <Markdown content={normalizeChatMarkdown(msg.content)} />
                    </div>
                  )}

                  {/* MyPal products */}
                  {msg.type === 'ai' && msg.mypalProducts && msg.mypalProducts.length > 0 && (
                    <div className="w-full space-y-2">
                      <p className="text-[10px] font-bold text-cobalt-light uppercase tracking-widest flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-cobalt-light" />
                        Available on MyPal
                      </p>
                      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
                        {msg.mypalProducts.map(p => (
                          <button key={p.id} type="button" onClick={() => openMyPalProduct(p)}
                            className="flex-shrink-0 w-36 bg-secondary rounded-xl overflow-hidden text-left hover:-translate-y-0.5 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-light">
                            <div className="relative aspect-square bg-cobalt-light/10 flex items-center justify-center">
                              <ShoppingBag className="w-8 h-8 text-cobalt-light/40" />
                              <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-full px-1.5 py-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                <span className="text-[9px] text-green-600 font-semibold">In Store</span>
                              </div>
                            </div>
                            <div className="p-2">
                              <p className="text-xs text-foreground line-clamp-2 leading-tight mb-1">{p.title}</p>
                              {p.category && <p className="text-[10px] text-muted-foreground">{p.category}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Web findings */}
                  {msg.type === 'ai' && msg.products && msg.products.length > 0 && (
                    <div className="w-full space-y-2">
                      <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                        <Globe className="w-3 h-3" /> Web findings
                      </p>
                      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
                        {msg.products.slice(0, 8).map((p, i) => (
                          <button key={i} type="button" onClick={() => openExternalProduct(p, i, msg.id)}
                            className="flex-shrink-0 w-36 bg-secondary rounded-xl overflow-hidden text-left hover:-translate-y-0.5 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-light">
                            <div className="relative aspect-square bg-background/50">
                              {p.thumbnail
                                ? <ProductImage src={p.thumbnail} alt={p.name ?? p.title} width={300} height={300} className="w-full h-full object-contain" loading="lazy" />
                                : p.source_url ? <LinkThumb url={p.source_url} label={p.source} /> : null}
                            </div>
                            <div className="p-2.5">
                              <p className="text-xs text-foreground line-clamp-2 leading-tight mb-1">{p.name ?? p.title}</p>
                              <p className="text-sm font-bold">
                                {p.total_cost != null || p.price != null ? `${p.currency ?? '$'}${p.total_cost ?? p.price}` : '—'}
                              </p>
                              {p.source && <p className="text-[10px] text-muted-foreground truncate">{p.source}</p>}
                              <span className="flex items-center gap-1 mt-1.5 text-[10px] text-cobalt-light">
                                <ExternalLink className="w-2.5 h-2.5" /> Open details
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up suggestions */}
                  {msg.type === 'ai' && msg.suggestions && (
                    <div className="flex flex-wrap gap-2">
                      {msg.suggestions.map(s => (
                        <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                          className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-cobalt-light/50 hover:bg-cobalt-light/5 text-muted-foreground hover:text-foreground transition-all">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {isTyping && (
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-lg bg-gradient-cobalt flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                  {model === 'pro'
                    ? <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                    : <Zap className="w-3.5 h-3.5 text-white animate-pulse" />
                  }
                </div>
                <div className="flex-1 space-y-2 pt-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {model === 'pro' ? 'Pro search' : 'Fast search'}
                  </span>
                  <div className="space-y-1.5">
                    {visibleThoughts.map((thought, i) => {
                      const active = i === visibleThoughts.length - 1;
                      return (
                        <div key={i} className={cn('flex items-center gap-2 text-xs transition-all duration-300',
                          active ? 'text-foreground' : 'text-muted-foreground opacity-50')}>
                          {active
                            ? <div className="w-1.5 h-1.5 rounded-full bg-cobalt-light animate-pulse flex-shrink-0" />
                            : <Check className="w-3 h-3 text-green-500 flex-shrink-0" />}
                          <span>{thought}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input area ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3">
        {/* Model selector + quota */}
        <div className="flex items-center gap-1.5 mb-2">
          {(['fast', 'pro'] as const).map(m => (
            <button
              key={m}
              onClick={() => selectModel(m)}
              disabled={m === 'pro' && proQuotaFull}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border',
                model === m
                  ? 'bg-cobalt-light text-white border-cobalt-light'
                  : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
                m === 'pro' && proQuotaFull && 'opacity-40 cursor-not-allowed',
              )}
            >
              {m === 'fast' ? <Zap className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
              {m === 'fast' ? 'Fast' : 'Pro'}
            </button>
          ))}

          {/* Pro quota counter — always visible, ticks down on each search */}
          <span className={cn(
            'ml-auto text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full border',
            proQuotaFull
              ? 'text-destructive border-destructive/40 bg-destructive/5'
              : 'text-muted-foreground border-border',
          )}>
            {proRemaining}/{quota.limit} Pro
          </span>
        </div>

        {/* Textarea + send */}
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-secondary/40 px-4 py-2 focus-within:border-cobalt-light/50 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={model === 'fast' ? 'Message MyPal…' : 'Deep search with Pro (3 / day)…'}
            className="flex-1 bg-transparent border-none resize-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[24px] max-h-[160px] leading-relaxed py-1"
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex-shrink-0 mb-0.5 w-8 h-8 rounded-xl bg-cobalt-light flex items-center justify-center disabled:opacity-30 hover:opacity-90 transition-all"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground/50 mt-2">
          MyPal AI can make mistakes. Verify important info.
        </p>
      </div>

      <ProductPreviewDrawer
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
};

// ── Shared feature history component ──────────────────────────────────────────

const FeatureHistory = ({
  feature,
  onLoad,
  renderSummary,
}: {
  feature: string;
  onLoad: (item: FeatureHistoryItem) => void;
  renderSummary: (item: FeatureHistoryItem) => string;
}) => {
  const { data, loading } = useAsync<FeatureHistoryItem[]>(
    () => searchService.getFeatureHistory(feature), [],
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  const items = data ?? [];
  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-border/50">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
        <Clock className="w-3 h-3" /> Previous
      </p>
      <div className="space-y-1.5">
        {items.slice(0, 8).map(item => (
          <div key={item._id} className="glass-card rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
              onClick={() => setExpanded(expanded === item._id ? null : item._id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate font-medium">{renderSummary(item)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(item.created_at)}</p>
              </div>
              <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform', expanded === item._id && 'rotate-90')} />
            </button>
            {expanded === item._id && (
              <div className="px-3 pb-3 space-y-2 border-t border-border/30">
                <div className="pt-2 text-xs text-muted-foreground line-clamp-4 leading-relaxed">
                  {item.output.slice(0, 300)}{item.output.length > 300 ? '…' : ''}
                </div>
                <button
                  onClick={() => { onLoad(item); setExpanded(null); }}
                  className="text-xs text-cobalt-light hover:underline font-medium"
                >
                  Load inputs →
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Translate Panel (notebook Cell 25 — translate_text) ───────────────────────

const TranslatePanel = () => {
  const [text, setText]         = useState('');
  const [language, setLanguage] = useState('Arabic');
  const [result, setResult]     = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  const handleTranslate = async () => {
    if (!text.trim()) return;
    setBusy(true); setError(''); setResult('');
    try {
      const out = await searchService.translateText(text.trim(), language);
      setResult(out);
    } catch (e: any) { setError(e?.message || 'Translation failed'); }
    finally { setBusy(false); }
  };

  return (
    <FeaturePanel
      icon={<Languages className="w-5 h-5 text-cobalt-light" />}
      title="Text Translation"
      subtitle="Translate product descriptions and reviews into any language"
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Target Language</label>
          <div className="glass-card px-3 py-2 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cobalt-light flex-shrink-0" />
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              className="flex-1 bg-transparent border-none text-sm text-foreground focus:outline-none">
              {LANGUAGES.map((l) => <option key={l} value={l} className="bg-background">{l}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Text to Translate</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            placeholder="Paste product description, review, or any text..."
            className="w-full glass-card rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-border/50 resize-none focus:outline-none focus:ring-1 focus:ring-cobalt-light/30" />
        </div>
        <Button onClick={handleTranslate} disabled={busy || !text.trim()}
          className="w-full bg-gradient-cobalt gap-2">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Translating...</> : <><Languages className="w-4 h-4" /> Translate</>}
        </Button>
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        {result && (
          <div className="glass-card p-4 rounded-xl space-y-2">
            <p className="text-[10px] font-bold text-cobalt-light uppercase tracking-widest">{language} Translation</p>
            <Markdown content={result} />
          </div>
        )}
        <FeatureHistory
          feature="translate"
          onLoad={item => {
            setText(String((item.input as any)?.text ?? ''));
            setLanguage(String((item.input as any)?.target_language ?? 'Arabic'));
            setResult(item.output);
          }}
          renderSummary={item => `→ ${(item.input as any)?.target_language ?? '?'}: ${String((item.input as any)?.text ?? '').slice(0, 50)}`}
        />
      </div>
    </FeaturePanel>
  );
};

// ── Summarize Panel (notebook Cell 27 — CohereSummarizer) ─────────────────────

const SummarizePanel = () => {
  const [text, setText]     = useState('');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [result, setResult] = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  const handleSummarize = async () => {
    if (!text.trim()) return;
    setBusy(true); setError(''); setResult('');
    try { setResult(await searchService.summarizeText(text.trim(), length)); }
    catch (e: any) { setError(e?.message || 'Summarization failed'); }
    finally { setBusy(false); }
  };

  return (
    <FeaturePanel
      icon={<FileText className="w-5 h-5 text-cobalt-light" />}
      title="Text Summary"
      subtitle="Summarize product descriptions and reviews into a quick read"
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Summary Length</label>
          <div className="flex gap-2">
            {(['short', 'medium', 'long'] as const).map((l) => (
              <button key={l} onClick={() => setLength(l)}
                className={cn('flex-1 py-2 rounded-lg text-xs font-semibold border transition-all capitalize',
                  length === l ? 'bg-cobalt-light text-white border-cobalt-light' : 'glass-card text-muted-foreground border-border/50 hover:text-foreground')}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Text to Summarize</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            placeholder="Paste product description or customer reviews..."
            className="w-full glass-card rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-border/50 resize-none focus:outline-none focus:ring-1 focus:ring-cobalt-light/30" />
        </div>
        <Button onClick={handleSummarize} disabled={busy || !text.trim()}
          className="w-full bg-gradient-cobalt gap-2">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Summarizing...</> : <><FileText className="w-4 h-4" /> Summarize</>}
        </Button>
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        {result && (
          <div className="glass-card p-4 rounded-xl space-y-2">
            <p className="text-[10px] font-bold text-cobalt-light uppercase tracking-widest">{length} Summary</p>
            <Markdown content={result} />
          </div>
        )}
        <FeatureHistory
          feature="summarize"
          onLoad={item => {
            setText(String((item.input as any)?.text ?? ''));
            setLength(((item.input as any)?.length as any) ?? 'medium');
            setResult(item.output);
          }}
          renderSummary={item => `${(item.input as any)?.length ?? 'medium'}: ${String((item.input as any)?.text ?? '').slice(0, 60)}`}
        />
      </div>
    </FeaturePanel>
  );
};

// ── Ask Product Panel (notebook Cell 30 — ProductExpertAgent) ─────────────────

const AskProductPanel = () => {
  const [productName, setProductName] = useState('');
  const [productSpecs, setProductSpecs] = useState('');
  const [persona, setPersona] = useState('');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleAsk = async () => {
    if (!question.trim()) return;
    setBusy(true); setError(''); setResult('');
    try {
      const productData: Record<string, unknown> = {};
      if (productName.trim()) productData['name'] = productName.trim();
      if (productSpecs.trim()) productData['specs'] = productSpecs.trim();
      const out = await searchService.askAboutProduct(question.trim(), productData, persona.trim() || undefined);
      setResult(out);
    } catch (e: any) { setError(e?.message || 'Failed to get answer'); }
    finally { setBusy(false); }
  };

  return (
    <FeaturePanel
      icon={<MessageSquare className="w-5 h-5 text-cobalt-light" />}
      title="Ask AI About Products"
      subtitle="MyPal Product Expert answers questions using product metadata"
    >
      <div className="space-y-3">
        <div className="glass-card p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Product Name</label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Sony WH-1000XM5 Headphones"
              className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Product Details / Specs</label>
            <textarea value={productSpecs} onChange={(e) => setProductSpecs(e.target.value)} rows={3}
              placeholder="Price, specs, availability, any other details..."
              className="w-full rounded-lg p-2 text-sm text-foreground placeholder:text-muted-foreground bg-background border border-border resize-none focus:outline-none focus:ring-1 focus:ring-cobalt-light/30" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">User Persona (optional)</label>
            <Input value={persona} onChange={(e) => setPersona(e.target.value)}
              placeholder="e.g. Professional Athlete, Gamer, Student..."
              className="h-9 text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Your Question</label>
          <div className="flex gap-2">
            <Input value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about this product..."
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              className="flex-1 h-10 text-sm" />
            <Button onClick={handleAsk} disabled={busy || !question.trim()} className="bg-gradient-cobalt px-4">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        {result && (
          <div className="glass-card p-4 rounded-xl space-y-2">
            <p className="text-[10px] font-bold text-cobalt-light uppercase tracking-widest">AI Expert Answer</p>
            <Markdown content={result} />
          </div>
        )}
        <FeatureHistory
          feature="ask-product"
          onLoad={item => {
            setQuestion(String((item.input as any)?.question ?? ''));
            setProductName(String((item.input as any)?.product_data?.name ?? ''));
            setProductSpecs(String((item.input as any)?.product_data?.specs ?? ''));
            setPersona(String((item.input as any)?.persona ?? ''));
            setResult(item.output);
          }}
          renderSummary={item => String((item.input as any)?.question ?? '').slice(0, 70)}
        />
      </div>
    </FeaturePanel>
  );
};

// ── Recommend Panel (notebook Cell 33 — MyPalProdRecommender) ─────────────────

const RecommendPanel = () => {
  const [mode, setMode]         = useState<'auto' | 'manual'>('auto');
  const [persona, setPersona]   = useState('');
  const [manualProducts, setManualProducts] = useState<any[]>([]);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductPreview | null>(null);

  // Auto-personalised (default) — uses real user activity from the server
  const { data: autoData, loading: autoLoading, refetch: refetchAuto } =
    useAsync(() => searchService.getPersonalizedRecommendations(), []);

  const { data: catalogData } = useAsync(() => productService.list({ pageSize: 24 }), []);
  const catalog = (catalogData?.products ?? []).map((p) => ({ id: p.id, title: p.title, category: p.category || '' }));

  const handleManualRecommend = async () => {
    if (!persona.trim()) return;
    setBusy(true); setError(''); setManualProducts([]);
    try {
      const raw = await searchService.getRecommendations(persona.trim(), catalog);
      const str   = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const match = str.match(/\[[\s\S]*?\]/);
      let topIds: string[] = [];
      if (match) { try { topIds = JSON.parse(match[0]).map(String); } catch { /* ignore */ } }
      const found = topIds.map((id) => catalogData?.products.find((p) => p.id === id)).filter(Boolean);
      setManualProducts(found.length > 0 ? found : catalogData?.products.slice(0, 3) ?? []);
    } catch (e: any) { setError(e?.message || 'Recommendation failed'); }
    finally { setBusy(false); }
  };

  const displayProducts = mode === 'auto'
    ? (autoData?.products ?? []).map((r) => ({ id: r.id, title: r.title, price: r.price, image: r.image, category: r.category }))
    : manualProducts;

  const isLoading = mode === 'auto' ? autoLoading : busy;
  const isPersonalized = mode === 'auto' && autoData?.persona === 'personalized';

  const openRecommendedProduct = async (product: any) => {
    const preview: ProductPreview = {
      id: product.id,
      title: product.title,
      price: Number(product.price ?? 0),
      image: product.image || PRODUCT_IMAGE_FALLBACK,
      source: 'marketplace',
      seller: product.seller ?? { name: 'MyPal', isMyPal: true },
      rating: Number(product.rating ?? 0),
      category: product.category,
      description: product.description ?? 'Recommended MyPal catalog listing. Open it here to review details and add it to your cart.',
    };
    setSelectedProduct(preview);

    try {
      const fullProduct = await productService.get(product.id);
      setSelectedProduct({
        ...fullProduct,
        source: 'marketplace',
        seller: fullProduct.seller ?? preview.seller,
      });
    } catch {
      // Keep the immediate preview if the detail endpoint is unavailable.
    }
  };

  return (
    <FeaturePanel
      icon={<Star className="w-5 h-5 text-cobalt-light" />}
      title="Recommendation System"
      subtitle="Personalised picks from your searches, orders & wishlist"
    >
      <div className="space-y-3">
        {/* Mode selector */}
        <div className="flex gap-2">
          {(['auto', 'manual'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn('flex-1 py-2 rounded-lg text-xs font-semibold border transition-all capitalize',
                mode === m ? 'bg-cobalt-light text-white border-cobalt-light' : 'glass-card text-muted-foreground border-border/50 hover:text-foreground')}>
              {m === 'auto' ? '✦ Auto (your activity)' : 'Custom persona'}
            </button>
          ))}
        </div>

        {mode === 'auto' ? (
          <div className="space-y-3">
            <div className="glass-card p-3 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {isPersonalized ? '✦ Personalised for you' : 'Popular products'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {isPersonalized
                    ? 'Based on your searches, wishlist & orders'
                    : 'Start searching and wishlisting to personalise'}
                </p>
              </div>
              <button onClick={() => refetchAuto()} disabled={autoLoading}
                className="text-xs text-cobalt-light hover:underline disabled:opacity-50">
                {autoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Refresh'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Your Interests</label>
            <textarea value={persona} onChange={(e) => setPersona(e.target.value)} rows={3}
              placeholder="e.g. Serious bodybuilder looking for clean recovery gear and gym equipment..."
              className="w-full glass-card rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-border/50 resize-none focus:outline-none focus:ring-1 focus:ring-cobalt-light/30" />
            <Button onClick={handleManualRecommend} disabled={busy || !persona.trim() || catalog.length === 0}
              className="w-full bg-gradient-cobalt gap-2">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing...</> : <><Star className="w-4 h-4" /> Get Recommendations</>}
            </Button>
          </div>
        )}

        {error && <p className="text-xs text-destructive text-center">{error}</p>}

        {/* Product cards */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-3 flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-secondary/60 flex-shrink-0" />
                <div className="w-12 h-12 rounded-lg bg-secondary/60 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-secondary/60 rounded w-3/4" />
                  <div className="h-3 bg-secondary/60 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : displayProducts.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-cobalt-light uppercase tracking-widest">
              Top {displayProducts.length} pick{displayProducts.length > 1 ? 's' : ''}
            </p>
            {displayProducts.map((p: any, i: number) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openRecommendedProduct(p)}
                className="glass-card p-3 flex w-full items-center gap-3 text-left transition-all hover:border-cobalt-light/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-light"
              >
                <div className="w-8 h-8 rounded-full bg-cobalt-light/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-black text-cobalt-light">#{i + 1}</span>
                </div>
                {p.image && <ProductImage src={p.image} alt={p.title} width={96} height={96} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-1">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.category}{p.price ? ` · $${Number(p.price).toFixed(2)}` : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
        <ProductPreviewDrawer
          product={selectedProduct}
          isOpen={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
        <FeatureHistory
          feature="recommend"
          onLoad={item => {
            setMode('manual');
            setPersona(String((item.input as any)?.persona ?? ''));
          }}
          renderSummary={item => String((item.input as any)?.persona ?? '').slice(0, 70)}
        />
      </div>
    </FeaturePanel>
  );
};

// ── Seller Analytics Panel (notebook Cell 35 — MyPalSellerAnalytics) ──────────

const SellerAnalyticsPanel = () => {
  const [products, setProducts] = useState<{ product_name: string; reviews: string[] }[]>([
    { product_name: '', reviews: [''] },
  ]);
  const [result, setResult] = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  const addProduct = () => setProducts((p) => [...p, { product_name: '', reviews: [''] }]);
  const removeProduct = (i: number) => setProducts((p) => p.filter((_, idx) => idx !== i));
  const setProductName = (i: number, v: string) =>
    setProducts((p) => p.map((pr, idx) => idx === i ? { ...pr, product_name: v } : pr));
  const addReview = (i: number) =>
    setProducts((p) => p.map((pr, idx) => idx === i ? { ...pr, reviews: [...pr.reviews, ''] } : pr));
  const setReview = (pi: number, ri: number, v: string) =>
    setProducts((p) => p.map((pr, idx) => idx === pi ? { ...pr, reviews: pr.reviews.map((r, j) => j === ri ? v : r) } : pr));
  const removeReview = (pi: number, ri: number) =>
    setProducts((p) => p.map((pr, idx) => idx === pi ? { ...pr, reviews: pr.reviews.filter((_, j) => j !== ri) } : pr));

  const handleAnalyze = async () => {
    const valid = products.filter((p) => p.product_name.trim() && p.reviews.some((r) => r.trim()));
    if (!valid.length) return;
    setBusy(true); setError(''); setResult('');
    try {
      const payload = valid.map((p) => ({
        product_name: p.product_name.trim(),
        reviews: p.reviews.filter((r) => r.trim()),
      }));
      setResult(await searchService.analyzeSellerPerformance(payload));
    } catch (e: any) { setError(e?.message || 'Analysis failed'); }
    finally { setBusy(false); }
  };

  return (
    <FeaturePanel
      icon={<BarChart3 className="w-5 h-5 text-cobalt-light" />}
      title="AI Seller Performance"
      subtitle="Turn customer reviews into a clear seller performance report"
    >
      <div className="space-y-4">
        {products.map((prod, pi) => (
          <div key={pi} className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Product {pi + 1}</label>
              {products.length > 1 && (
                <button onClick={() => removeProduct(pi)} className="text-destructive hover:opacity-70">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Input value={prod.product_name} onChange={(e) => setProductName(pi, e.target.value)}
              placeholder="e.g. Ergonomic Keyboard" className="h-9 text-sm" />
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Reviews</label>
              {prod.reviews.map((rev, ri) => (
                <div key={ri} className="flex gap-2">
                  <Input value={rev} onChange={(e) => setReview(pi, ri, e.target.value)}
                    placeholder={`Review ${ri + 1}...`} className="flex-1 h-9 text-sm" />
                  {prod.reviews.length > 1 && (
                    <button onClick={() => removeReview(pi, ri)} className="text-muted-foreground hover:text-destructive p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => addReview(pi)} className="text-xs text-cobalt-light flex items-center gap-1 hover:opacity-80">
                <Plus className="w-3 h-3" /> Add review
              </button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <button onClick={addProduct} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/60 rounded-lg px-3 py-2">
            <Plus className="w-3 h-3" /> Add product
          </button>
          <Button onClick={handleAnalyze} disabled={busy} className="flex-1 bg-gradient-cobalt gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing seller...</> : <><BarChart3 className="w-4 h-4" /> Generate Report</>}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        {result && (
          <div className="glass-card p-4 rounded-xl space-y-2">
            <p className="text-[10px] font-bold text-cobalt-light uppercase tracking-widest">Seller Identity Report</p>
            <Markdown content={result} />
          </div>
        )}
        <FeatureHistory
          feature="seller"
          onLoad={item => {
            const prev = (item.input as any)?.products;
            if (Array.isArray(prev)) setProducts(prev);
            setResult(item.output);
          }}
          renderSummary={item => {
            const ps = (item.input as any)?.products as Array<{ product_name: string }> | undefined;
            return ps?.map(p => p.product_name).filter(Boolean).join(', ').slice(0, 70) ?? 'Seller report';
          }}
        />
      </div>
    </FeaturePanel>
  );
};

// ── Shared FeaturePanel wrapper ────────────────────────────────────────────────

const FeaturePanel = ({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) => (
  <div className="h-full overflow-y-auto">
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-cobalt-light/10 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-serif font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  </div>
);

export default AISearchScreen;
