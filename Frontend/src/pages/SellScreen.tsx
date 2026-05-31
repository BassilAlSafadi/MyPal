import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ImagePlus, Loader2, X, Tag, DollarSign, Package, Sparkles,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { cn } from '@/lib/utils';
import { uploadProductImage, supabase } from '@/lib/supabase';
import { productService } from '@/services/productService';
import { toast } from 'sonner';

interface MediaItem {
  id: string;
  url: string;
  uploading: boolean;
}

const CATEGORIES = [
  'Electronics', 'Fashion', 'Home & Garden', 'Sports & Outdoors',
  'Books & Media', 'Vehicles & Parts', 'Collectibles & Art', 'Services',
];

const MAX_MEDIA = 6;

const SellScreen = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const priceNum = Number(price);
  const readyMedia = media.filter((m) => !m.uploading && m.url);
  const isUploading = media.some((m) => m.uploading);
  const canSubmit =
    name.trim().length > 0 &&
    priceNum > 0 &&
    readyMedia.length > 0 &&
    !isUploading &&
    !submitting;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!supabase) {
      toast.error('Image uploads are not configured.');
      return;
    }
    const remaining = MAX_MEDIA - media.length;
    const selected = Array.from(files).slice(0, Math.max(0, remaining));
    if (selected.length === 0) {
      toast.error(`You can add up to ${MAX_MEDIA} photos.`);
      return;
    }

    for (const file of selected) {
      const id = crypto.randomUUID();
      setMedia((prev) => [...prev, { id, url: '', uploading: true }]);
      try {
        const { url } = await uploadProductImage(file);
        setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, url, uploading: false } : m)));
      } catch (err) {
        setMedia((prev) => prev.filter((m) => m.id !== id));
        toast.error('Upload failed', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      }
    }
  };

  const removeMedia = (id: string) => setMedia((prev) => prev.filter((m) => m.id !== id));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const product = await productService.create({
        name: name.trim(),
        description: description.trim() || undefined,
        price: priceNum,
        category: category || undefined,
        media: readyMedia.map((m, i) => ({ url: m.url, mediaType: 'photo', displayOrder: i })),
      });
      toast.success('Listing published', {
        description: `${product.title} is now live on MyPal.`,
      });
      navigate('/home');
    } catch (err) {
      toast.error('Could not publish listing', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border/50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-cobalt-light" />
            <h1 className="text-lg font-serif font-bold text-foreground">Sell a Product</h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-6">
        {/* Media */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Photos <span className="text-destructive">*</span>
            </label>
            <span className="text-[10px] text-muted-foreground">{media.length}/{MAX_MEDIA}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {media.map((m) => (
              <div key={m.id} className="relative aspect-square rounded-xl overflow-hidden border border-border/60 bg-secondary">
                {m.uploading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-cobalt-light animate-spin" />
                  </div>
                ) : (
                  <>
                    <img src={m.url} alt="Product" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeMedia(m.id)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-background"
                      aria-label="Remove photo"
                    >
                      <X className="w-3.5 h-3.5 text-foreground" />
                    </button>
                  </>
                )}
              </div>
            ))}

            {media.length < MAX_MEDIA && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-border/70 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-cobalt-light/60 hover:text-cobalt-light transition-colors"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Add</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <p className="text-[11px] text-muted-foreground">At least one photo is required. JPG, PNG, WebP up to 10 MB each.</p>
        </section>

        {/* Name */}
        <section className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Product name <span className="text-destructive">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vintage Polaroid Camera"
            maxLength={120}
            className="h-11 text-sm"
          />
        </section>

        {/* Price */}
        <section className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Price (USD) <span className="text-destructive">*</span>
          </label>
          <div className="glass-card flex items-center gap-2 px-3 h-11">
            <DollarSign className="w-4 h-4 text-cobalt-light flex-shrink-0" />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0.00"
              className="flex-1 bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          {price !== '' && priceNum <= 0 && (
            <p className="text-[11px] text-destructive">Enter a price greater than 0.</p>
          )}
        </section>

        {/* Category */}
        <section className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Category
          </label>
          <div className="glass-card flex items-center gap-2 px-3 h-11">
            <Package className="w-4 h-4 text-cobalt-light flex-shrink-0" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 bg-transparent border-none text-sm text-foreground focus:outline-none"
            >
              <option value="" className="bg-background">Select a category (optional)</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-background">{c}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Description */}
        <section className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Describe the condition, features, and anything a buyer should know..."
            className="w-full glass-card rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-border/50 resize-none focus:outline-none focus:ring-1 focus:ring-cobalt-light/30"
          />
        </section>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'w-full h-14 bg-gradient-cobalt hover:opacity-90 text-primary-foreground font-bold rounded-2xl gap-2 shadow-xl shadow-cobalt/20',
          )}
        >
          {submitting ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Publishing...</>
          ) : isUploading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Uploading photos...</>
          ) : (
            <><Sparkles className="w-5 h-5" /> Publish Listing</>
          )}
        </Button>
      </div>

      <BottomNav />
    </div>
  );
};

export default SellScreen;
