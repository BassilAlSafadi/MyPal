import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
  /** 'sm' tightens the type scale for compact bubbles (e.g. the chat advisor). */
  size?: 'base' | 'sm';
  className?: string;
}

/**
 * Renders AI model output as polished prose instead of raw markdown.
 * Styling lives in the `.ai-prose` rules in index.css so it tracks the theme.
 */
export const Markdown = ({ content, size = 'base', className }: MarkdownProps) => (
  <div className={cn('ai-prose', size === 'sm' && 'ai-prose-sm', className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export default Markdown;
