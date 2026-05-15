import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Sparkles, RotateCcw, Globe, ExternalLink, Heart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import BottomNav from '@/components/BottomNav';
import { useMockStore } from '@/lib/useMockStore';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  products?: Product[];
  sources?: { name: string; url: string }[];
  suggestions?: string[];
  timestamp: Date;
}

const mockSources = [
  { name: 'TechRadar', url: 'https://techradar.com' },
  { name: 'CNET', url: 'https://cnet.com' },
  { name: 'The Verge', url: 'https://theverge.com' },
  { name: 'Tom\'s Guide', url: 'https://tomsguide.com' },
  { name: 'PCMag', url: 'https://pcmag.com' },
];

import { searchService } from '@/services/searchService';
import type { Product } from '@/mock/products';


const AISearchScreen = () => {
  const navigate = useNavigate();
  const { wishlist, addToWishlist, removeFromWishlist } = useMockStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput('');
    setIsTyping(true);

    try {
      const results = await searchService.performGlobalAgenticSearch(currentInput, (log) => {
        // Option: show progress logs in the UI
        console.log(`[AI Progress] ${log}`);
      });

      const aiMessage: Message = {
        id: `msg-ai-${Date.now()}`,
        type: 'ai',
        content: results.length > 0 
          ? `I found ${results.length} relevant products for you based on your request.`
          : `I couldn't find exact matches for "${currentInput}", but here are some suggestions.`,
        products: results,
        timestamp: new Date(),
        suggestions: [
          'Compare these options',
          'Show cheaper alternatives',
          'Tell me more about the first one'
        ]
      };
      
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      const errorMessage: Message = {
        id: `msg-err-${Date.now()}`,
        type: 'ai',
        content: 'I encountered an error while searching. Please try again in a moment.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  const handleNewSearch = () => {
    setMessages([]);
    setInput('');
  };

  const toggleWishlist = (productId: string) => {
    if (wishlist.includes(productId)) {
      removeFromWishlist(productId);
    } else {
      addToWishlist(productId);
    }
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
          <Button variant="ghost" size="sm" onClick={handleNewSearch} className="gap-1.5">
            <RotateCcw className="w-4 h-4" /> New Search
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-full bg-cobalt-light/10 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-cobalt-light" />
            </div>
            <h2 className="text-xl font-serif font-bold text-foreground mb-2">
              Ask me anything
            </h2>
            <p className="text-sm text-muted-foreground max-w-xs mb-6">
              Describe what you&apos;re looking for in natural language and I&apos;ll help you find the best products.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {['Best laptop under $1000', 'Wireless earbuds for running', 'Gift ideas for gamers'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-xs px-3 py-1.5 glass-card text-muted-foreground hover:text-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.type === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.type === 'user' ? (
                <div className="bg-gradient-cobalt text-primary-foreground px-4 py-2 rounded-2xl rounded-br-sm max-w-[80%]">
                  <p className="text-sm">{message.content}</p>
                </div>
              ) : (
                <div className="glass-card p-4 rounded-2xl rounded-bl-sm max-w-[90%] space-y-4">
                  {/* Summary */}
                  <p className="text-sm text-foreground leading-relaxed">{message.content}</p>

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Sources</p>
                      <div className="flex flex-wrap gap-2">
                        {message.sources.map((source) => (
                          <span
                            key={source.name}
                            className="text-xs px-2 py-1 bg-secondary rounded-full flex items-center gap-1 text-muted-foreground"
                          >
                            <Globe className="w-3 h-3" />
                            {source.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Products */}
                  {message.products && message.products.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Products</p>
                      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1">
                        {message.products.map((product) => (
                          <div
                            key={product.id}
                            className="flex-shrink-0 w-36 bg-secondary rounded-xl overflow-hidden"
                          >
                            <div className="relative aspect-square">
                              <img
                                src={product.image}
                                alt={product.title}
                                className="w-full h-full object-cover"
                              />
                              <button
                                onClick={() => toggleWishlist(product.id)}
                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center"
                              >
                                <Heart
                                  className={cn(
                                    "w-3 h-3",
                                    wishlist.includes(product.id)
                                      ? "fill-destructive text-destructive"
                                      : "text-foreground"
                                  )}
                                />
                              </button>
                            </div>
                            <div className="p-2">
                              <p className="text-xs text-foreground line-clamp-2 leading-tight mb-1">
                                {product.title}
                              </p>
                              <p className="text-sm font-bold text-foreground">
                                ${product.price}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggestions */}
                  {message.suggestions && message.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {message.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="text-xs px-3 py-1.5 bg-cobalt-light/10 text-cobalt-light rounded-full hover:bg-cobalt-light/20 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="glass-card px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-background">
        <div className="glass-card p-1 flex items-center gap-2">
          <Input
            placeholder="Ask about products..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            className="bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 h-10"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
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
