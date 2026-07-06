// ══════════════════════════════════════════════════════════════════════════════
// SEED RUNNER — Chauffeurs de test (filtre vehicle_type)
// Sprint 3 — EasyVTC
//
// Le trigger on_auth_user_created crée automatiquement public.users + public.drivers
// depuis raw_user_meta_data. Ce script passe les métadonnées lors de la création
// auth, puis complète les champs absents du trigger (phone, vehicle_type, is_online…).
//
// Usage     : npx tsx supabase/seeds/run_test_drivers.ts
// Nettoyage : npx tsx supabase/seeds/run_test_drivers.ts --cleanup
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL         = process.env['SUPABASE_URL']!;
const SUPABASE_SERVICE_KEY = process.env['SUPABASE_SECRET_KEY'] ?? process.env['SUPABASE_SERVICE_ROLE_KEY']!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('  SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Données de test ────────────────────────────────────────────────────────────

const DRIVERS = [
  //  Éligibles : active + is_online
  { email: 'driver.standard1@test.easyvtc.com', firstName: 'Mamadou', lastName: 'Diallo',  phone: '+33699990001', vehicleType: 'standard', isOnline: true,  status: 'active'    as const, vehicle: { plate: 'AB-001-FR', brand: 'Toyota',     model: 'Yaris',        year: 2022, color: 'blanc',  type: 'standard' } },
  { email: 'driver.standard2@test.easyvtc.com', firstName: 'Fatou',   lastName: 'Sow',     phone: '+33699990002', vehicleType: 'standard', isOnline: true,  status: 'active'    as const, vehicle: { plate: 'AB-002-FR', brand: 'Renault',    model: 'Clio',         year: 2021, color: 'gris',   type: 'standard' } },
  { email: 'driver.berline1@test.easyvtc.com',  firstName: 'Pierre',  lastName: 'Martin',  phone: '+33699990003', vehicleType: 'berline',  isOnline: true,  status: 'active'    as const, vehicle: { plate: 'AB-003-FR', brand: 'Mercedes',   model: 'Classe E',     year: 2023, color: 'noir',   type: 'berline'  } },
  { email: 'driver.berline2@test.easyvtc.com',  firstName: 'Sophie',  lastName: 'Dubois',  phone: '+33699990004', vehicleType: 'berline',  isOnline: true,  status: 'active'    as const, vehicle: { plate: 'AB-004-FR', brand: 'BMW',        model: 'Série 5',      year: 2022, color: 'blanc',  type: 'berline'  } },
  { email: 'driver.van1@test.easyvtc.com',      firstName: 'Ahmed',   lastName: 'Traoré',  phone: '+33699990005', vehicleType: 'van',      isOnline: true,  status: 'active'    as const, vehicle: { plate: 'AB-005-FR', brand: 'Mercedes',   model: 'V-Class',      year: 2023, color: 'noir',   type: 'van'      } },
  { email: 'driver.van2@test.easyvtc.com',      firstName: 'Claire',  lastName: 'Bernard', phone: '+33699990006', vehicleType: 'van',      isOnline: true,  status: 'active'    as const, vehicle: { plate: 'AB-006-FR', brand: 'Volkswagen', model: 'Transporter',  year: 2021, color: 'argent', type: 'van'      } },
  //  Exclus
  { email: 'driver.offline@test.easyvtc.com',   firstName: 'Luc',     lastName: 'Moreau',  phone: '+33699990007', vehicleType: 'standard', isOnline: false, status: 'active'    as const, vehicle: { plate: 'AB-007-FR', brand: 'Peugeot',    model: '308',          year: 2020, color: 'rouge',  type: 'standard' } },
  { email: 'driver.suspended@test.easyvtc.com', firstName: 'Nina',    lastName: 'Petit',   phone: '+33699990008', vehicleType: 'berline',  isOnline: true,  status: 'suspended' as const, vehicle: { plate: 'AB-008-FR', brand: 'Audi',       model: 'A6',           year: 2022, color: 'gris',   type: 'berline'  } },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function ok(label: string)              { console.log(`   ${label}`); }
function ko(label: string, err: unknown){ console.error(`   ${label}:`, (err as any)?.message ?? err); }

// ── Nettoyage ─────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n🧹  Nettoyage des comptes de test…\n');
  const emails = DRIVERS.map(d => d.email);

  // Récupérer les UUIDs depuis public.users
  const { data: rows, error: fetchErr } = await supabase
    .from('users')
    .select('id, email')
    .in('email', emails);

  if (fetchErr) { ko('Récupération IDs', fetchErr); return; }
  if (!rows || rows.length === 0) { console.log('  Aucun compte de test trouvé.\n'); return; }

  // Supprimer les auth users — cascade vers public.users → public.drivers → public.vehicles
  for (const row of rows) {
    const { error } = await supabase.auth.admin.deleteUser(row.id);
    if (error) ko(`deleteUser ${row.email}`, error);
    else ok(`Supprimé : ${row.email}`);
  }

  console.log(`\n✔  Nettoyage terminé (${rows.length} compte(s)).\n`);
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌱  Insertion des chauffeurs de test…\n');
  console.log('  (Le trigger on_auth_user_created gère public.users + public.drivers)');
  console.log();

  // Index des comptes déjà présents
  const { data: existingRows } = await supabase
    .from('users')
    .select('id, email')
    .in('email', DRIVERS.map(d => d.email));

  const existingByEmail = new Map<string, string>(
    (existingRows ?? []).map(r => [r.email, r.id])
  );

  for (const d of DRIVERS) {
    const tag = `${d.firstName} ${d.lastName} (${d.vehicleType}, online=${d.isOnline}, status=${d.status})`;

    // ── 1. Création auth — le trigger crée public.users + public.drivers ─────
    let userId = existingByEmail.get(d.email);

    if (!userId) {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email:         d.email,
        password:      'Driver1234!',
        email_confirm: true,
        // Le trigger handle_new_user lit ces métadonnées pour remplir public.users
        user_metadata: {
          role:         'driver',
          first_name:   d.firstName,
          last_name:    d.lastName,
          rgpd_consent: true,
        },
      });
      if (authErr || !authData.user) { ko(`auth.createUser ${tag}`, authErr); continue; }
      userId = authData.user.id;
      ok(`Auth créé : ${d.email} (${userId.slice(0, 8)}…)`);
    } else {
      ok(`Existant  : ${d.email} (${userId.slice(0, 8)}…)`);
    }

    // ── 2. Compléter public.users (phone + role=driver) ──────────────────────
    const { error: userUpdErr } = await supabase
      .from('users')
      .update({ phone: d.phone, role: 'driver', first_name: d.firstName, last_name: d.lastName })
      .eq('id', userId);
    if (userUpdErr) ko(`users update ${tag}`, userUpdErr);

    // ── 3. Upsert public.drivers ──────────────────────────────────────────────
    // Upsert pour couvrir le cas où le trigger n'a pas créé le record driver
    // (ex: user_metadata absent lors d'un run précédent → role=client par défaut).
    const { data: driverData, error: driverErr } = await supabase
      .from('drivers')
      .upsert({
        user_id:      userId,
        vehicle_type: d.vehicleType,
        is_online:    d.isOnline,
        status:       d.status,
        zone:         'france',
        tva_rate:     10.00,
      }, { onConflict: 'user_id' })
      .select('id')
      .single();

    if (driverErr || !driverData) { ko(`drivers upsert ${tag}`, driverErr); continue; }
    const driverId = driverData.id;

    // ── 4. Véhicule ────────────────────────────────────────────────────────────
    const { data: existingVehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('driver_id', driverId)
      .eq('is_active', true)
      .maybeSingle();

    if (!existingVehicle) {
      const { error: vErr } = await supabase.from('vehicles').insert({
        driver_id:    driverId,
        plate_number: d.vehicle.plate,
        brand:        d.vehicle.brand,
        model:        d.vehicle.model,
        year:         d.vehicle.year,
        color:        d.vehicle.color,
        type:         d.vehicle.type,
        is_active:    true,
      });
      if (vErr) { ko(`vehicles insert ${tag}`, vErr); continue; }
    }

    ok(tag);
  }

  // ── Résumé ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Résultats attendus via GET /reservations/drivers/available :');
  console.log('  ?vehicle_type=standard  →  2 chauffeurs (Mamadou, Fatou)');
  console.log('  ?vehicle_type=berline   →  2 chauffeurs (Pierre, Sophie)');
  console.log('  ?vehicle_type=van       →  2 chauffeurs (Ahmed, Claire)');
  console.log('  (sans filtre)           →  6 chauffeurs');
  console.log('─────────────────────────────────────────────────────────────\n');
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

const isCleanup = process.argv.includes('--cleanup');
if (isCleanup) {
  await cleanup();
} else {
  await seed();
}
