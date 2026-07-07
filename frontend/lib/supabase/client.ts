'use client';

import { createBrowserClient } from '@supabase/ssr';

// Client-side Supabase client — used in 'use client' components (login form, upload widget)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
