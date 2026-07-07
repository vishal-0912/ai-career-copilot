import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();
  // 303 forces the browser to follow the redirect with a GET request.
  // The default (307) preserves the original POST, and /login only handles GET —
  // that mismatch is exactly what was producing the HTTP 405.
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
