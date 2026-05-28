import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RotateCcw, Zap, ShoppingBag, ExternalLink, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import BottomNav from '@/components/BottomNav';
import { cn } from '@/lib/utils';
import { searchService, SearchModel, ExternalProduct } from '@/services/searchService';

// ── Pro quota ─────────────────────────────────────────────────────────────────

const PRO_QUOTA = 3;

function getProUsage(): { date: string; count: number } {
  const today = new Date().toISOString().split('T')[0];
  try {
    const stored = JSON.parse(localStorage.getItem('mypal_pro_quota') ?? '{}') as {
      date?: string;
      count?: number;
    };
    if (stored.date === today) return { date: today, count: stored.count ?? 0 };
  } catch {}
  return { date: today, count: 0 };
}

function consumeProQuota(): number {
  const usage = getProUsage();
  const next = { date: usage.date, count: usage.count + 1 };
  localStorage.setItem('mypal_pro_quota', JSON.stringify(next));
  return next.count;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MyPalProduct {
  id: string;
  title: string;
  category?: string;
  score?: number;
}

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  model?: SearchModel;
  mypalProducts?: MyPalProduct[];
  products?: ExternalProduct[];
  suggestions?: string[];
  timestamp: Date;
}

// ── Component ─────────────────────────────────────────────────────────────────

const AISearchScreen = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [model, setModel] = useState<SearchModel>('fast');
  const [proUsageCount, setProUsageCount] = useState(() => getProUsage().count);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const proRemaining = Math.max(0, PRO_QUOTA - proUsageCount);
  const proQuotaFull = proUsageCount >= PRO_QUOTA;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const query = input.trim();
    if (!query || isTyping) return;
    if (model === 'pro' && proQuotaFull) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: query,
      model,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Step 1 — RAG: query the MyPal DB first
      const internalResults = await searchService.performInternalSearch(query);

      // Step 2 — AI search with RAG context
      const aiResult = await searchService.performAISearch(query, model, internalResults);

      // Deduct Pro quota only on success
      if (model === 'pro') {
        setProUsageCount(consumeProQuota());
      }

      const mypalProducts: MyPalProduct[] = internalResults.slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        score: r.score,
      }));

      const fallbackText =
        internalResults.length > 0
          ? `Found ${internalResults.length} matching product${internalResults.length === 1 ? '' : 's'} in MyPal for "${query}".`
          : `No exact MyPal match for "${query}". Try Pro for a deeper web search.`;

      const aiMsg: Message = {
        id: `msg-ai-${Date.now()}`,
        type: 'ai',
        content: aiResult.text || fallbackText,
        model,
        mypalProducts: mypalProducts.length > 0 ? mypalProducts : undefined,
        products: aiResult.products.length > 0 ? aiResult.products : undefined,
        suggestions: ['Tell me more about the first one', 'Show cheaper alternatives', 'Compare these options'],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          type: 'ai',
          content: 'Search failed. Please try again in a moment.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleNewSearch = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cobalt-light" />
          <h1 className="text-lg font-serif font-bold text-foreground">AI Search</h1>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleNewSearch}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> New
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-full bg-cobalt-light/10 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-cobalt-light" />
            </div>
            <h2 className="text-xl font-serif font-bold text-foreground mb-2">Ask me anything</h2>
            <p className="text-sm text-muted-foreground max-w-xs mb-6">
              Describe what you&apos;re looking for and I&apos;ll search MyPal and the web for you.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {['Best laptop under $1000', 'Wireless earbuds for running', 'Gift ideas for gamers'].map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-xs px-3 py-1.5 glass-card text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ),
              )}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn('flex', message.type === 'user' ? 'justify-end' : 'justify-start')}
            >
              {message.type === 'user' ? (
                /* User bubble */
                <div className="bg-gradient-cobalt text-primary-foreground px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[80%]">
                  <p className="text-sm">{message.content}</p>
                  {message.model && (
                    <div className="flex items-center gap-1 mt-1 opacity-60">
                      {message.model === 'fast' ? (
                        <Zap className="w-2.5 h-2.5" />
                      ) : (
                        <Sparkles className="w-2.5 h-2.5" />
                      )}
                      <span className="text-[10px] capitalize">{message.model}</span>
                    </div>
                  )}
                </div>
              ) : (
                /* AI bubble */
                <div className="glass-card p-4 rounded-2xl rounded-bl-sm max-w-[92%] space-y-4">
                  <p className="text-sm text-foreground leading-relaxed">{message.content}</p>

                  {/* ── MyPal internal products (RAG) ─────────────── */}
                  {message.mypalProducts && message.mypalProducts.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-cobalt-light" />
                        <p className="text-xs font-semibold text-cobalt-light">Available on MyPal</p>
                      </div>
                      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
                        {message.mypalProducts.map((product) => (
                          <div
                            key={product.id}
                            className="flex-shrink-0 w-36 border border-cobalt-light/25 bg-cobalt-light/5 rounded-xl p-2.5"
                          >
                            <div className="w-9 h-9 rounded-lg bg-cobalt-light/10 flex items-center justify-center mb-2">
                              <ShoppingBag className="w-4 h-4 text-cobalt-light" />
                            </div>
                            <p className="text-xs text-foreground font-medium line-clamp-2 leading-tight mb-1.5">
                              {product.title}
                            </p>
                            {product.category && (
                              <p className="text-[10px] text-muted-foreground mb-1.5">
                                {product.category}
                              </p>
                            )}
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              <span className="text-[10px] text-green-600 font-medium">In Store</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── External AI-found products (Pro deep search) ── */}
                  {message.products && message.products.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-muted-foreground" />
                        <p className="text-xs font-medium text-muted-foreground">Web Findings</p>
                      </div>
                      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1">
                        {message.products.slice(0, 6).map((product, i) => (
                          <div key={i} className="flex-shrink-0 w-36 bg-secondary rounded-xl overflow-hidden">
                            <div className="p-2.5">
                              <p className="text-xs text-foreground line-clamp-2 leading-tight mb-1">
                                {product.name ?? product.title}
                              </p>
                              <p className="text-sm font-bold text-foreground">
                                {product.total_cost != null || product.price != null
                                  ? `${product.currency ?? '$'}${product.total_cost ?? product.price}`
                                  : '—'}
                              </p>
                              {product.source_url && (
                                <a
                                  href={product.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 mt-1.5 text-[10px] text-cobalt-light hover:underline"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" /> View
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Follow-up suggestions ─────────────────────── */}
                  {message.suggestions && message.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {message.suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => setInput(s)}
                          className="text-xs px-3 py-1.5 bg-cobalt-light/10 text-cobalt-light rounded-full hover:bg-cobalt-light/20 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="glass-card px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1">
                {[0, 150, 300].map((delay) => (
                  <div
                    key={delay}
                    className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-border bg-background space-y-2">
        {/* Model selector */}
        <div className="flex items-center gap-1.5">
          {(['fast', 'pro'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModel(m)}
              disabled={m === 'pro' && proQuotaFull}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border',
                model === m
                  ? 'bg-cobalt-light text-white border-cobalt-light shadow-sm'
                  : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30',
                m === 'pro' && proQuotaFull && 'opacity-40 cursor-not-allowed',
              )}
            >
              {m === 'fast' ? <Zap className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
              {m === 'fast' ? 'Fast' : 'Pro'}
            </button>
          ))}

          {model === 'pro' && (
            <span
              className={cn(
                'ml-auto text-xs',
                proQuotaFull ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {proQuotaFull
                ? 'Quota full — resets tomorrow'
                : `${proRemaining} Pro ${proRemaining === 1 ? 'use' : 'uses'} left today`}
            </span>
          )}
        </div>

        {/* Chat input */}
        <div className="glass-card p-1 flex items-center gap-2">
          <Input
            placeholder={model === 'fast' ? 'Quick search...' : 'Deep search with AI Pro...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            className="bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 h-10"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping || (model === 'pro' && proQuotaFull)}
            className="bg-gradient-cobalt p-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Send className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default AISearchScreen;
