import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Browser Supabase client — used only for Storage uploads of seller media.
 * Auth is handled by the MyPal gateway/JWT, so we disable Supabase session
 * persistence to avoid interfering with the app's own auth.
 */
export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const PRODUCT_MEDIA_BUCKET = 'product-media';

const MAX_BYTES = 10 * 1024 * 1024; // keep in sync with the bucket's file_size_limit
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export interface UploadedMedia {
  url: string;
  mediaType: 'photo';
}

/**
 * Uploads a single image to the public `product-media` bucket and returns its
 * public URL. Throws a user-friendly Error on validation or network failure.
 */
export async function uploadProductImage(file: File): Promise<UploadedMedia> {
  if (!supabase) {
    throw new Error('Image uploads are not configured (missing Supabase keys).');
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only JPG, PNG, WebP, GIF or AVIF images are allowed.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Each image must be 10 MB or smaller.');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `listings/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(error.message || 'Upload failed. Please try again.');
  }

  const { data } = supabase.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, mediaType: 'photo' };
}
