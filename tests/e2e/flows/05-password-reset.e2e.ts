// ══════════════════════════════════════════════════════════════════════════════
// E2E Flow — Mot de passe oublié / réinitialisation
//
// Scénario :
//   Inscription → forgot-password (smoke) → génération du token de recovery
//   (via Supabase admin, en lieu et place de la lecture réelle de l'email) →
//   reset-password avec ce token → login avec le nouveau mot de passe
//
// Reproduit le correctif : auth.service.ts utilise désormais
// `data.properties.hashed_token` (et non plus `action_link`, une URL à usage
// unique déjà consommée avant que l'utilisateur ne l'utilise) comme token de
// réinitialisation, transmis tel quel à /auth/reset-password puis vérifié via
// `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })`.
// ══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { api, apiAs } from '../helpers/api.js';
import { testSupabase } from '../helpers/supabase.js';
import { deleteTestUser, cleanupByEmail, uniqueTestId } from '../helpers/cleanup.js';

const UID         = uniqueTestId();
const TEST_EMAIL  = `e2e.pwreset.${UID}@test.easyvtc.com`;
const TEST_PASS   = 'TestE2E2026!';
const NEW_PASS    = 'NewTestE2E2026!';
const TEST_PHONE  = `+338${parseInt(UID.slice(0, 8), 16).toString().padStart(10, '0').slice(2, 10)}`;

let userId = '';

beforeAll(async () => {
  await cleanupByEmail(TEST_EMAIL);

  const res = await api.post('/auth/register').send({
    email:        TEST_EMAIL,
    password:     TEST_PASS,
    first_name:   'Chloé',
    last_name:    'PwResetTest',
    phone:        TEST_PHONE,
    role:         'client',
    accept_terms: true,
    rgpd_consent: true,
  });

  if (res.status !== 201) {
    throw new Error(`[E2E setup password-reset] Register failed: ${res.status} — ${JSON.stringify(res.body)}`);
  }
  userId = res.body.data.user.id;
});

afterAll(async () => {
  await deleteTestUser(userId);
});

describe('Password reset E2E — forgot-password', () => {
  it('répond 200 pour un email existant (déclenche generateLink + envoi email)', async () => {
    const res = await api.post('/auth/forgot-password').send({ email: TEST_EMAIL });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('répond 200 même pour un email inconnu (ne révèle pas l\'existence du compte)', async () => {
    const res = await api.post('/auth/forgot-password').send({ email: `e2e.ghost.${UID}@test.easyvtc.com` });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejette un email mal formé (400)', async () => {
    const res = await api.post('/auth/forgot-password').send({ email: 'pas-un-email' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe('Password reset E2E — reset-password avec le token réellement envoyé par email', () => {
  it('accepte le hashed_token (celui inséré dans l\'email par sendResetPasswordEmail) et met à jour le mot de passe', async () => {
    // Reproduit exactement ce que fait auth.service.ts#forgotPassword : generateLink()
    // puis utilisation de data.properties.hashed_token — c'est cette valeur qui est
    // maintenant affichée en clair dans l'email (voir email.service.ts).
    const { data, error } = await testSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: TEST_EMAIL,
      options: { redirectTo: 'easyvtc://reset-password' },
    });
    expect(error).toBeNull();
    if (error || !data.properties) throw new Error(`generateLink failed: ${error?.message}`);
    expect(data.properties.hashed_token).toBeTruthy();

    const resetRes = await apiAs(data.properties.hashed_token)
      .post('/auth/reset-password')
      .send({ new_password: NEW_PASS });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.ok).toBe(true);

    // Le nouveau mot de passe doit réellement fonctionner…
    const loginNew = await api.post('/auth/login').send({ email: TEST_EMAIL, password: NEW_PASS });
    expect(loginNew.status).toBe(200);
    expect(loginNew.body.ok).toBe(true);

    // … et l'ancien ne doit plus être valide.
    const loginOld = await api.post('/auth/login').send({ email: TEST_EMAIL, password: TEST_PASS });
    expect(loginOld.status).toBe(401);
  });

  it('rejette un token déjà utilisé (à usage unique)', async () => {
    const { data, error } = await testSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: TEST_EMAIL,
      options: { redirectTo: 'easyvtc://reset-password' },
    });
    if (error || !data.properties) throw new Error(`generateLink failed: ${error?.message}`);
    const token = data.properties.hashed_token;

    const first = await apiAs(token).post('/auth/reset-password').send({ new_password: 'AutrePass2026!' });
    expect(first.status).toBe(200);

    const second = await apiAs(token).post('/auth/reset-password').send({ new_password: 'EncoreUnAutre2026!' });
    expect(second.status).toBe(401);
    expect(second.body.ok).toBe(false);
    expect(second.body.message).toMatch(/invalide ou expiré/i);
  });

  it('rejette un token inventé/aléatoire (401)', async () => {
    const res = await apiAs('token-completement-invalide-xyz')
      .post('/auth/reset-password')
      .send({ new_password: 'PeuImporte2026!' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('rejette sans header Authorization (token vide → 401)', async () => {
    const res = await api.post('/auth/reset-password').send({ new_password: 'PeuImporte2026!' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('rejette un nouveau mot de passe trop faible (400) avant même de vérifier le token', async () => {
    const res = await apiAs('un-token-quelconque')
      .post('/auth/reset-password')
      .send({ new_password: 'faible' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
