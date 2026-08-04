import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Sparkles, Zap, RotateCcw, ChevronDown } from 'lucide-react';
import { Markdown } from '@/components/Markdown';
import { searchService } from '@/services/searchService';
import { normalizeChatMarkdown } from '@/lib/chatMarkdown';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  error?: boolean;
}

const SUGGESTIONS = [
  'What\'s trending right now?',
  'Find me something under $50',
  'Compare marketplace vs web prices',
  'Best electronics deals today',
];

const AIChatBubble = () => {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    const query = text.trim();
    if (!query || isLoading) return;

    setInput('');
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: query };
    const loadingMsg: Message = { id: `a-${Date.now()}`, role: 'assistant', content: '', loading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      // Run internal search + fast AI search in parallel
      const [internalResults, aiResult] = await Promise.all([
        searchService.performInternalSearch(query),
        searchService.performAISearch(query, []).catch(() => ({ text: '', products: [] })),
      ]);

      // Build the response text
      const aiText = aiResult.text.trim();
      const internalCount = internalResults.length;
      const fallback = internalCount > 0
        ? `Found **${internalCount}** matching item${internalCount > 1 ? 's' : ''} in the MyPal catalog. Open the Search tab to browse them.`
        : `No exact MyPal matches for "${query}". Try the Global Agentic search for web results.`;

      const content = aiText || fallback;

      setMessages((prev) =>
        prev.map((m) => (m.loading ? { ...m, content, loading: false } : m)),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.loading
            ? { ...m, content: 'Something went wrong. Please try again.', loading: false, error: true }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => setMessages([]);

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 0.75rem)' }}
          className="fixed right-4 z-50 w-14 h-14 rounded-full bg-gradient-cobalt flex items-center justify-center shadow-2xl shadow-cobalt/30 hover:scale-110 active:scale-95 transition-transform"
          aria-label="Open AI Advisor"
        >
          <Sparkles className="w-6 h-6 text-primary-foreground" />
        </button>
      )}

      {/* Chat panel — full width on mobile, fixed width on desktop */}
      {open && (
        <div
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 0.75rem)' }}
          className={cn(
            'fixed z-50 right-4 left-4',
            'sm:left-auto sm:w-[420px]',          // desktop: fixed 420px from right
            'glass-card flex flex-col shadow-2xl shadow-black/20',
            'rounded-2xl overflow-hidden',
            'max-h-[70vh] sm:max-h-[600px]',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-cobalt flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-none">AI Advisor</p>
                <p className="text-[10px] text-white/70 leading-none mt-0.5 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> Powered by Groq + MyPal catalog
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white/80"
                  aria-label="Clear chat"
                  title="Clear conversation"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white/80"
                aria-label="Close"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/50">
            {messages.length === 0 ? (
              /* Empty state with suggestions */
              <div className="h-full flex flex-col items-center justify-center text-center py-4 space-y-5">
                <div className="w-14 h-14 rounded-full bg-cobalt-light/10 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-cobalt-light" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Ask me anything</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    I search MyPal's catalog and the web for you
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-xs px-3 py-1.5 glass-card text-cobalt-light hover:bg-cobalt-light/10 transition-colors rounded-full border border-cobalt-light/20"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex',
                      msg.role === 'user' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    {msg.role === 'user' ? (
                      <div className="max-w-[80%] bg-gradient-cobalt text-primary-foreground px-3.5 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed">
                        {msg.content}
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'max-w-[90%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm',
                          msg.error
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-secondary',
                        )}
                      >
                        {msg.loading ? (
                          <div className="flex items-center gap-1.5 py-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-cobalt-light animate-bounce [animation-delay:0ms]" />
                            <div className="w-1.5 h-1.5 rounded-full bg-cobalt-light animate-bounce [animation-delay:150ms]" />
                            <div className="w-1.5 h-1.5 rounded-full bg-cobalt-light animate-bounce [animation-delay:300ms]" />
                          </div>
                        ) : (
                          <Markdown content={normalizeChatMarkdown(msg.content)} size="sm" />
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border/50 bg-background/80 flex-shrink-0">
            <div className="flex items-center gap-2 glass-card px-3 py-1.5 rounded-xl">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about products, prices, deals…"
                disabled={isLoading}
                className="flex-1 bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 py-1.5"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="p-2 bg-gradient-cobalt rounded-lg disabled:opacity-40 transition-opacity hover:opacity-90 flex-shrink-0"
                aria-label="Send"
              >
                <Send className="w-3.5 h-3.5 text-primary-foreground" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              Enter to send · Searches catalog + web
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatBubble;
