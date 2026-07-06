/**
 * Seed — Comptes de démonstration EasyVTC
 *
 * Usage :
 *   npx ts-node --esm supabase/seeds/run_seed_demo.ts
 *   ou
 *   npx tsx supabase/seeds/run_seed_demo.ts
 *
 * Requiert les variables d'environnement du fichier .env à la racine.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  SUPABASE_URL ou SUPABASE_SECRET_KEY manquant dans .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Comptes ────────────────────────────────────────────────────────────────────

const ACCOUNTS = [
  {
    id:         'aa000000-0000-0000-0000-000000000001',
    email:      'admin@easyvtc.com',
    password:   'Admin1234!',
    first_name: 'Super',
    last_name:  'Admin',
    phone:      '+33600000100',
    role:       'admin' as const,
  },
  {
    id:         'cc000000-0000-0000-0000-000000000001',
    email:      'client@easyvtc.com',
    password:   'Client1234!',
    first_name: 'Marie',
    last_name:  'Dupont',
    phone:      '+33600000101',
    role:       'client' as const,
  },
  {
    id:         'dd000000-0000-0000-0000-000000000001',
    email:      'driver@easyvtc.com',
    password:   'Driver1234!',
    first_name: 'Ibrahima',
    last_name:  'Diallo',
    phone:      '+33600000102',
    role:       'driver' as const,
  },
  {
    id:         'ee000000-0000-0000-0000-000000000001',
    email:      'manager@easyvtc.com',
    password:   'Manager1234!',
    first_name: 'Aissatou',
    last_name:  'Ndiaye',
    phone:      '+33600000103',
    role:       'manager' as const,
  },
] as const;

const ADMIN_ID   = 'aa000000-0000-0000-0000-000000000001';
const DRIVER_ID  = 'dd000000-0000-0000-0000-000000000001';
const MANAGER_ID = 'ee000000-0000-0000-0000-000000000001';

const MANAGER_PERMISSIONS = [
  'view_reservations',
  'assign_reservation',
  'cancel_reservation',
  'view_drivers',
  'view_clients',
  'view_orders',
  'view_invoices',
  'view_documents',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

function fail(label: string, err: unknown) {
  console.error(`  ✗ ${label}`, err);
}

// ── Nettoyage ──────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n── Nettoyage des comptes existants…');
  for (const { id } of ACCOUNTS) {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error && !error.message.includes('not found')) {
      fail(`deleteUser ${id}`, error.message);
    } else {
      ok(`supprimé auth.users id=${id}`);
    }
  }
}

// ── Création des comptes auth ──────────────────────────────────────────────────

async function createAuthUsers() {
  console.log('\n── Création des comptes auth.users…');
  for (const account of ACCOUNTS) {
    const { error } = await supabase.auth.admin.createUser({
      user_metadata: {
        role:          account.role,
        first_name:    account.first_name,
        last_name:     account.last_name,
        rgpd_consent:  true,
      },
      email:             account.email,
      password:          account.password,
      email_confirm:     true,
    });

    if (error) {
      fail(`createUser ${account.email}`, error.message);
      throw new Error(`Arrêt — échec création ${account.email}`);
    }
    ok(`${account.role.padEnd(7)}  ${account.email}`);
  }
}

// ── Récupérer l'UUID réel attribué par Supabase ────────────────────────────────
// (Supabase peut ignorer l'id fourni dans createUser selon la version)

async function getUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  const user = data.users.find(u => u.email === email);
  if (!user) throw new Error(`Utilisateur ${email} introuvable après création`);
  return user.id;
}

// ── Mise à jour public.users ───────────────────────────────────────────────────

async function updatePublicUsers() {
  console.log('\n── Mise à jour public.users…');

  for (const account of ACCOUNTS) {
    const uid = await getUserId(account.email);

    const extra: Record<string, unknown> = { phone: account.phone, status: 'active' };
    if (account.role === 'manager') {
      extra.coverage_zone  = 'Île-de-France';
      extra.priority_level = 2;
    }

    const { error } = await supabase
      .from('users')
      .update(extra)
      .eq('id', uid);

    if (error) fail(`update users ${account.email}`, error.message);
    else ok(`users.${account.role}  phone + status${account.role === 'manager' ? ' + zone + priority' : ''}`);
  }
}

// ── Mise à jour public.drivers ─────────────────────────────────────────────────

async function updateDriver() {
  console.log('\n── Mise à jour public.drivers…');
  const uid = await getUserId('driver@easyvtc.com');

  const { error } = await supabase
    .from('drivers')
    .update({
      status:       'active',
      vehicle_type: 'berline',
      siret:        '12345678901234',
      tva_rate:     10.00,
      is_online:    true,
      zone:         'france',
    })
    .eq('user_id', uid);

  if (error) fail('update drivers', error.message);
  else ok('drivers — active, berline, online, france');
}

// ── Véhicule du chauffeur ──────────────────────────────────────────────────────

async function insertVehicle() {
  console.log('\n── Insertion public.vehicles…');
  const uid = await getUserId('driver@easyvtc.com');

  const { data: driver, error: dErr } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', uid)
    .single();

  if (dErr || !driver) { fail('get driver id', dErr?.message); return; }

  const { error } = await supabase
    .from('vehicles')
    .insert({
      driver_id:    driver.id,
      plate_number: 'EZ-100-VTC',
      brand:        'Mercedes',
      model:        'Classe E',
      year:         2023,
      color:        'noir',
      type:         'berline',
      is_active:    true,
    });

  if (error) fail('insert vehicle', error.message);
  else ok('vehicles — Mercedes Classe E 2023, EZ-100-VTC');
}

// ── Permissions du gestionnaire ────────────────────────────────────────────────

async function insertManagerPermissions() {
  console.log('\n── Permissions manager…');
  const managerUid = await getUserId('manager@easyvtc.com');
  const adminUid   = await getUserId('admin@easyvtc.com');

  const { error: delErr } = await supabase
    .from('manager_permissions')
    .delete()
    .eq('manager_id', managerUid);

  if (delErr) fail('delete existing permissions', delErr.message);

  const rows = MANAGER_PERMISSIONS.map(perm => ({
    manager_id: managerUid,
    permission: perm,
    granted_by: adminUid,
  }));

  const { error } = await supabase.from('manager_permissions').insert(rows);

  if (error) fail('insert manager_permissions', error.message);
  else ok(`${MANAGER_PERMISSIONS.length} permissions accordées`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Seed — Comptes de démonstration EasyVTC');
  console.log('  Projet :', SUPABASE_URL);
  console.log('═══════════════════════════════════════════════════════');

  await cleanup();
  await createAuthUsers();
  await updatePublicUsers();
  await updateDriver();
  await insertVehicle();
  await insertManagerPermissions();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Comptes prêts :');
  console.log('    admin@easyvtc.com    / Admin1234!');
  console.log('    client@easyvtc.com   / Client1234!');
  console.log('    driver@easyvtc.com   / Driver1234!');
  console.log('    manager@easyvtc.com  / Manager1234!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌  Seed échoué :', err);
  process.exit(1);
});
