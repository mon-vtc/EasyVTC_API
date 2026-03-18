import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';

const supabaseServerKey =
  env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(env.SUPABASE_URL, supabaseServerKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});