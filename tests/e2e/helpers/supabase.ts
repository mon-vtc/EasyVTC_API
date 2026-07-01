// Client Supabase admin réel — utilisé par les helpers E2E (création/suppression
// d'utilisateurs de test, vérification de données en BDD).
// Doit avoir exactement la même config que supabaseAdmin dans src/database/supabase/client.ts
// pour que auth.admin.* (listUsers, deleteUser, updateUserById) fonctionnent.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.TEST_SUPABASE_URL!;
const supabaseKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

export const testSupabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  // Le header Authorization explicite est requis pour les opérations auth.admin.*
  // (listUsers, deleteUser, updateUserById). Sans lui, Supabase retourne
  // "Database error finding users" même avec la service_role key.
  global: {
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
    },
  },
});
