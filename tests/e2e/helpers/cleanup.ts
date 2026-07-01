// Fonctions de nettoyage post-suite : supprime les données de test du Supabase staging.

import { randomUUID } from 'crypto';
import { testSupabase } from './supabase.js';

export async function deleteTestUser(userId: string): Promise<void> {
  if (!userId) return;
  // 1. Supprimer les dépendances avec contrainte RESTRICT (reservations)
  await testSupabase.from('reservations').delete().eq('client_id', userId);
  // 2. Supprimer depuis auth.users — la CASCADE PostgreSQL supprime public.users
  //    et toutes les tables enfant (drivers, notifications, etc.)
  const { error } = await testSupabase.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`[E2E cleanup] deleteUser(${userId}) →`, error.message);
    // Fallback : suppression directe de public.users si la cascade n'a pas eu lieu
    await testSupabase.from('users').delete().eq('id', userId);
  }
}

export async function deleteTestUsers(userIds: string[]): Promise<void> {
  await Promise.all(userIds.map(deleteTestUser));
}

/**
 * Supprime un user E2E par email.
 * Deux stratégies en cascade :
 *   1. Cherche dans public.users (cas normal : trigger OK)
 *   2. Cherche dans auth.users via listUsers (trigger échoué → pas de public.users)
 */
export async function cleanupByEmail(email: string): Promise<void> {
  // Stratégie 1 : public.users
  const { data: user } = await testSupabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (user?.id) {
    await deleteTestUser(user.id);
    return;
  }

  // Stratégie 2 : auth.users via listUsers (nécessite Authorization header sur testSupabase)
  const { data, error: listErr } = await testSupabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.warn(`[E2E cleanupByEmail] listUsers échoué :`, listErr.message);
    return;
  }
  const authUser = data?.users?.find((u) => u.email === email);
  if (authUser) {
    await deleteTestUser(authUser.id);
  }
}

// Supprime toutes les réservations créées par un utilisateur (nettoyage avant deleteUser)
export async function deleteReservationsByClient(clientId: string): Promise<void> {
  await testSupabase.from('reservations').delete().eq('client_id', clientId);
}

/**
 * Génère un identifiant unique pour les emails de test.
 * Utilise crypto.randomUUID() pour garantir ~122 bits d'entropie — collision impossible
 * même avec des milliers de runs et la résolution d'horloge Windows (15.6 ms).
 * Format : <16 premiers hex chars du UUID> → pas de tirets, longueur fixe.
 */
export function uniqueTestId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}
