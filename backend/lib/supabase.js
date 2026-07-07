const { createClient } = require('@supabase/supabase-js');

// Uses the service_role key — this runs server-side only, never expose it to the frontend.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = { supabase };
