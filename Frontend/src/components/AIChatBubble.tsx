import { useState } from 'react';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/Markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const AIChatBubble = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your MyPal AI Advisor. Ask me to filter results, compare prices, or get recommendations!" },
  ]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Mock AI reply
    setTimeout(() => {
      const reply = getMockReply(input);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    }, 800);
  };

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 0.75rem)' }}
          className="fixed right-4 z-50 w-14 h-14 rounded-full bg-gradient-cobalt flex items-center justify-center animate-pulse-glow shadow-2xl"
        >
          <MessageCircle className="w-6 h-6 text-primary-foreground" />
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 0.75rem)' }}
          className="fixed right-4 left-4 z-50 max-w-sm ml-auto glass-card flex flex-col max-h-[60vh] glow-cobalt"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cobalt-light" />
              <span className="text-sm font-semibold text-foreground">AI Advisor</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-secondary">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-gradient-cobalt text-primary-foreground rounded-br-md text-xs leading-relaxed'
                    : 'bg-secondary rounded-bl-md'
                }`}>
                  {msg.role === 'user'
                    ? msg.content
                    : <Markdown content={msg.content} size="sm" />}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask your advisor..."
              className="bg-secondary border-none text-foreground text-xs h-9 focus-visible:ring-0"
            />
            <button onClick={handleSend} className="bg-gradient-cobalt p-2 rounded-lg flex-shrink-0">
              <Send className="w-4 h-4 text-primary-foreground" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

function getMockReply(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes('laptop') || lower.includes('macbook'))
    return "I found 3 laptops matching your criteria. The MacBook Pro 14\" M4 Pro at $1,999 from Amazon is the top pick. Want me to add it to your Wishlist?";
  if (lower.includes('under') || lower.includes('cheap') || lower.includes('budget'))
    return "I've filtered results by price. The best budget options are the Bose QC Ultra Earbuds at $299 and the Vintage Polaroid at $120 from our marketplace.";
  if (lower.includes('compare'))
    return "Comparing top results: External retailers average $831, while MyPal Marketplace averages $218 — a 74% savings potential on similar items.";
  if (lower.includes('wishlist'))
    return "Your Wishlist has 2 items. The Sony WH-1000XM5 just dropped $71 from its original price! 🎉";
  return "I can help you filter by price, source, category, or seller. Try: 'Show external laptops under $1000' or 'Compare marketplace vs external prices'.";
}

export default AIChatBubble;
