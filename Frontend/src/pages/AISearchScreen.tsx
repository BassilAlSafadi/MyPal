import { useState, useRef, useEffect } from 'react';
import {
  Send, Sparkles, ShoppingBag, ExternalLink, Globe,
  Check, MessageSquare, Loader2,
  Plus, Trash2, ChevronDown, History, X, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { cn } from '@/lib/utils';
import { searchService, ExternalProduct, ChatThread, ChatMessage } from '@/services/searchService';
import { productService } from '@/services/productService';
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

const THOUGHTS = [
  'Understanding your question...',
  'Searching the web and the MyPal catalog...',
  'Reviewing the best matches...',
  'Writing your answer...',
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  mypalProducts?: { id: string; title: string; category?: string; score?: number; image?: string | null }[];
  products?: ExternalProduct[];
  suggestions?: string[];
  timestamp: Date;
}

// ── Main Component ─────────────────────────────────────────────────────────────

const AISearchScreen = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cobalt-light" />
          <h1 className="text-lg font-serif font-bold text-foreground">AI Hub</h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <SearchPanel />
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
    mypalProducts: Array.isArray(msg.internal_products) && msg.internal_products.length > 0
      ? msg.internal_products as { id: string; title: string; category?: string; image?: string | null }[]
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
    let idx = 0;
    setVisibleThoughts([THOUGHTS[0]]);
    idx = 1;
    thoughtTimerRef.current = setInterval(() => {
      if (idx < THOUGHTS.length) { setVisibleThoughts(p => [...p, THOUGHTS[idx]].slice(-6)); idx++; }
    }, 1200);
    return () => { if (thoughtTimerRef.current) clearInterval(thoughtTimerRef.current); };
  }, [isTyping]);

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
    if (!query || isTyping) return;

    setMessages(p => [...p, {
      id: `u-${Date.now()}`, type: 'user', content: query, timestamp: new Date(),
    }]);
    setInput('');
    setIsTyping(true);

    let internalResults: Awaited<ReturnType<typeof searchService.performInternalSearch>> = [];
    let internalPayload: Array<{ id: string; title: string; category?: string; image?: string | null }> = [];

    try {
      internalResults = await searchService.performInternalSearch(query);
      internalPayload = internalResults.slice(0, 5).map(r => ({
        id: r.id, title: r.title, category: r.category, image: r.image_url,
      }));

      const activeThreadId = await ensureThread();
      if (!activeThreadId) throw new Error('Could not create thread');

      const { message } = await searchService.sendThreadMessage(activeThreadId, query, internalPayload);

      // Auto-title on first message of a new chat
      if (threadTitle === 'New chat') {
        const newTitle = query.slice(0, 55);
        setThreadTitle(newTitle);
        setThreadList(prev => prev.map(t => t._id === activeThreadId ? { ...t, title: newTitle, updated_at: new Date().toISOString() } : t));
      }

      const mypalProducts = (message.internal_products && message.internal_products.length > 0
        ? message.internal_products
        : internalPayload) as { id: string; title: string; category?: string; image?: string | null }[];

      const fallback = internalResults.length > 0
        ? `Found ${internalResults.length} matching product${internalResults.length === 1 ? '' : 's'} in MyPal for "${query}".`
        : `No exact MyPal match for "${query}".`;

      setMessages(p => [...p, {
        id: message._id || `a-${Date.now()}`,
        type: 'ai',
        content: message.content || fallback,
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
      const status = err?.status;
      const messageText = String(err?.message || '');

      try {
        toast.info('Chat history is temporarily busy - returning a one-off answer.');
        const fallbackResult = await searchService.performAISearch(query, internalResults);
        const fallbackText = fallbackResult.text || (
          internalResults.length > 0
            ? `Found ${internalResults.length} matching product${internalResults.length === 1 ? '' : 's'} in MyPal for "${query}".`
            : `No exact MyPal match for "${query}". Try again in a moment.`
        );

        setMessages(p => [...p, {
          id: `a-${Date.now()}`,
          type: 'ai',
          content: fallbackText,
          mypalProducts: internalPayload.length > 0 ? internalPayload : undefined,
          products: fallbackResult.products.length > 0 ? fallbackResult.products : undefined,
          suggestions: ['Tell me more', 'Show cheaper alternatives', 'Compare options'],
          timestamp: new Date(),
        }]);
      } catch (fallbackErr: any) {
        const fallbackMessage = String(fallbackErr?.message || '');
        const isRateLimited = fallbackErr?.status === 429 || status === 429 || /rate limit/i.test(fallbackMessage) || /rate limit/i.test(messageText);
        const content = isRateLimited
          ? 'AI is temporarily rate-limited. Please try again in a minute.'
          : 'Search failed. Please try again in a moment.';
        setMessages(p => [...p, { id: `err-${Date.now()}`, type: 'ai', content, timestamp: new Date() }]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const openMyPalProduct = async (product: { id: string; title: string; category?: string; score?: number; image?: string | null }) => {
    const preview: ProductPreview = {
      id: product.id, title: product.title, price: 0,
      image: product.image || PRODUCT_IMAGE_FALLBACK, source: 'marketplace',
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

  const canSend = input.trim().length > 0 && !isTyping;

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
              Search products, compare prices, get recommendations.
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
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}

                <div className={cn('flex flex-col gap-3', msg.type === 'user' ? 'items-end max-w-[80%]' : 'items-start flex-1 min-w-0')}>
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
                              {p.image
                                ? <ProductImage src={p.image} alt={p.title} width={300} height={300} className="w-full h-full object-cover" loading="lazy" />
                                : <ShoppingBag className="w-8 h-8 text-cobalt-light/40" />}
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
                  <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                </div>
                <div className="flex-1 space-y-2 pt-1">
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
        {/* Textarea + send */}
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-secondary/40 px-4 py-2 focus-within:border-cobalt-light/50 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Message MyPal…"
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

export default AISearchScreen;
