// Nettoyage global : supprime TOUS les utilisateurs de test (@test.eazyvtc.com)
// avant que les suites E2E s'exécutent — inclut les orphelins dans auth.users
// qui n'ont plus de ligne dans public.users (résidu de cleanups partiels).
//
// Le client Supabase DOIT avoir un header Authorization explicite pour que
// auth.admin.listUsers et auth.admin.deleteUser fonctionnent sans erreur.

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

export default async function globalSetup(): Promise<void> {
  config({ path: resolve(process.cwd(), '.env.test.e2e'), override: true });

  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn('[E2E globalSetup] Credentials staging manquants — nettoyage ignoré');
    return;
  }

  // Header Authorization explicite requis pour auth.admin.* (listUsers, deleteUser)
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${key}` } },
  });

  // ── Stratégie 1 : utilisateurs visibles dans public.users ─────────────────
  const { data: publicUsers } = await supabase
    .from('users')
    .select('id, email')
    .like('email', '%@test.eazyvtc.com');

  if (publicUsers && publicUsers.length > 0) {
    console.log(`\n[E2E globalSetup] ${publicUsers.length} utilisateur(s) dans public.users — nettoyage...`);
    for (const user of publicUsers) {
      await supabase.from('reservations').delete().eq('client_id', user.id);
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) {
        console.warn(`[E2E globalSetup] deleteUser(${user.email}) →`, error.message);
        await supabase.from('users').delete().eq('id', user.id);
      }
    }
  }

  // ── Stratégie 2 : orphelins dans auth.users (public.users déjà supprimé) ──
  const orphanIds: string[] = [];
  let page = 1;
  while (true) {
    const { data: authData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) {
      console.warn(`[E2E globalSetup] listUsers page ${page} →`, listErr.message);
      break;
    }
    if (!authData?.users?.length) break;

    for (const u of authData.users) {
      if (u.email?.endsWith('@test.eazyvtc.com')) {
        orphanIds.push(u.id);
      }
    }

    const next = (authData as { nextPage?: number }).nextPage;
    if (!next) break;
    page = next;
  }

  if (orphanIds.length > 0) {
    console.log(`[E2E globalSetup] ${orphanIds.length} orphelin(s) dans auth.users — suppression...`);
    for (const id of orphanIds) {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) console.warn(`[E2E globalSetup] orphan deleteUser(${id}) →`, error.message);
    }
  }

  if ((publicUsers?.length ?? 0) + orphanIds.length > 0) {
    console.log('[E2E globalSetup] Nettoyage terminé.\n');
  }
}
