import { useState } from 'react';
import { Globe } from 'lucide-react';
import { faviconUrl, getDomain } from '@/lib/linkImage';
import { cn } from '@/lib/utils';

interface LinkThumbProps {
  url: string;
  /** Fallback label when the domain can't be parsed (e.g. the retailer name). */
  label?: string;
  className?: string;
}

/**
 * Visual stand-in for a web finding that has no product photo: shows the
 * link's favicon and domain so the card reflects "something of the link"
 * instead of an empty box. Renders absolutely to fill its (relative) parent.
 */
export const LinkThumb = ({ url, label, className }: LinkThumbProps) => {
  const [failed, setFailed] = useState(false);
  const fav = faviconUrl(url, 128);
  const domain = getDomain(url);

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-purple-500/[0.06] to-secondary',
        className,
      )}
    >
      {fav && !failed ? (
        <img
          src={fav}
          alt={domain ?? label ?? 'Link preview'}
          className="w-12 h-12 object-contain rounded-lg bg-white/70 p-1.5 shadow-sm"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <Globe className="w-10 h-10 text-purple-400/60" />
      )}
      {(domain || label) && (
        <span className="px-3 text-[10px] font-bold text-muted-foreground text-center line-clamp-1 max-w-full">
          {domain ?? label}
        </span>
      )}
    </div>
  );
};

export default LinkThumb;
