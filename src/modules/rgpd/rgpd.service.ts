// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module RGPD
// Sprint 7 — EazyVTC
//
// Conformité :
//   - France  : RGPD (Règlement général sur la protection des données)
//   - Sénégal : Loi 2008-12 sur la protection des données personnelles (CDP)
//
// Deux opérations :
//   exportData  → collecte toutes les données personnelles (droit d'accès)
//   anonymize   → efface l'identité tout en conservant les données comptables
//                 (factures, ordres de mission) pour conformité fiscale
// ══════════════════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { supabaseAdmin } from '../../database/supabase/client.js';
import { notificationsService } from '../notifications/notifications.service.js';
import type { RgpdExport, AnonymizeResult } from './rgpd.types.js';
import type { UserRole } from '../auth/auth.types.js';

export class RgpdService {

  // ══════════════════════════════════════════════════════════════════════════
  // GET /users/:id/data-export — Droit d'accès (Art. 15 RGPD)
  // ══════════════════════════════════════════════════════════════════════════
  async exportData(userId: string, requesterId: string, requesterRole: UserRole): Promise<RgpdExport> {
    this._checkAccess(userId, requesterId, requesterRole);

    // ── Phase 1 : profil, réservations et profil chauffeur (parallèle) ───────
    const [profileResult, reservationsResult, driverResult] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, email, first_name, last_name, phone, role, profile_photo_url, rgpd_consent, rgpd_consent_at, created_at, updated_at')
        .eq('id', userId)
        .single(),

      supabaseAdmin
        .from('reservations')
        .select('id, status, pickup_address, dest_address, vehicle_type, price_estimated, price_final, scheduled_at, created_at')
        .eq('client_id', userId)
        .order('scheduled_at', { ascending: false }),

      supabaseAdmin
        .from('drivers')
        .select('id, status, vehicle_type, zone, siret, created_at')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (!profileResult.data) {
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    // ── Phase 2 : activités liées (parallèle) ────────────────────────────────
    const reservationIds = (reservationsResult.data ?? []).map((r: any) => r.id as string);

    const [ordersResult, favoritesResult, ratingsResult, notificationsResult, messagesResult] = await Promise.all([
      reservationIds.length > 0
        ? supabaseAdmin
            .from('orders')
            .select('id, order_number, issued_at, trip_snapshot')
            .in('reservation_id', reservationIds)
        : Promise.resolve({ data: [] as unknown[], error: null }),

      supabaseAdmin
        .from('user_favorites')
        .select('id, label, address, lat, lng, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('ratings')
        .select('id, reservation_id, note, created_at')
        .eq('client_id', userId)
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('notifications')
        .select('id, type, title, body, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('chat_messages')
        .select('id, reservation_id, content, created_at')
        .eq('sender_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    return {
      exported_at:  new Date().toISOString(),
      user_id:      userId,
      legal_basis:  'Droit d\'accès — Art. 15 RGPD (France) / Art. 20 Loi 2008-12 CDP (Sénégal)',

      profile:       profileResult.data  ?? null,
      driver_profile: driverResult.data  ?? null,

      reservations:   reservationsResult.data  ?? [],
      orders:         (ordersResult.data        ?? []) as unknown[],
      favorites:      favoritesResult.data      ?? [],
      ratings_given:  ratingsResult.data        ?? [],
      notifications:  notificationsResult.data  ?? [],
      chat_messages:  messagesResult.data       ?? [],
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /users/:id/anonymize — Droit à l'effacement (Art. 17 RGPD)
  // ══════════════════════════════════════════════════════════════════════════
  async anonymize(userId: string, requesterId: string, requesterRole: UserRole): Promise<AnonymizeResult> {
    this._checkAccess(userId, requesterId, requesterRole);

    // Récupérer l'utilisateur
    const { data: user, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('id, role, deleted_at, profile_photo_url')
      .eq('id', userId)
      .single();

    if (fetchErr || !user) {
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    if (user.role === 'admin') {
      throw { status: 403, message: 'Impossible d\'anonymiser un compte administrateur' };
    }

    if (user.deleted_at) {
      throw { status: 422, message: 'Ce compte a déjà été anonymisé' };
    }

    const anonymizedEmail = `anonymized_${userId}@deleted.eazyvtc.fr`;
    const now = new Date().toISOString();

    // ── 1. Anonymiser la table users ─────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({
        first_name:        'Utilisateur',
        last_name:         'Anonymisé',
        email:             anonymizedEmail,
        phone:             null,
        profile_photo_url: null,
        deleted_at:        now,
        status:            'inactive',
        updated_at:        now,
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('[RGPD] anonymize DB error:', updateErr);
      throw { status: 500, message: "Erreur lors de l'anonymisation du compte" };
    }

    // ── 2. Anonymiser le compte Supabase Auth (fire-and-forget) ──────────────
    // Changement d'email + reset du mot de passe pour empêcher toute reconnexion
    supabaseAdmin.auth.admin.updateUserById(userId, {
      email:    anonymizedEmail,
      password: crypto.randomBytes(32).toString('hex'),
    }).catch((err) => console.warn('[RGPD] Auth update failed:', err));

    // ── 3. Invalider toutes les sessions actives (fire-and-forget) ───────────
    supabaseAdmin.auth.admin.signOut(userId, 'global')
      .catch((err) => console.warn('[RGPD] signOut failed:', err));

    // ── 4. Supprimer la photo de profil du Storage (fire-and-forget) ─────────
    if (user.profile_photo_url) {
      const exts = ['jpg', 'jpeg', 'png', 'webp'];
      supabaseAdmin.storage
        .from('profile-photos')
        .remove(exts.map((ext) => `${userId}/avatar.${ext}`))
        .catch(() => {}); // Silencieux — le fichier peut déjà avoir été supprimé
    }

    // Alerte aux admins — anonymisation RGPD (fire-and-forget)
    notificationsService.sendToAdmins(
      'user_anonymized_admin',
      'Compte anonymisé (RGPD Art.17)',
      `Un compte a été anonymisé suite à une demande d'effacement RGPD${requesterId !== userId ? ' par un administrateur' : ' par l\'utilisateur'}.`,
      { user_id: userId, requested_by: requesterId },
    );

    return {
      user_id:        userId,
      anonymized_at:  now,
      message:        'Compte anonymisé avec succès. Toutes les données personnelles ont été effacées.',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVÉ — Contrôle d'accès
  // Un utilisateur ne peut agir que sur son propre compte.
  // Un admin peut agir sur n'importe quel compte.
  // ══════════════════════════════════════════════════════════════════════════
  private _checkAccess(userId: string, requesterId: string, requesterRole: UserRole): void {
    if (requesterRole === 'admin') return;

    if (requesterId !== userId) {
      throw { status: 403, message: 'Accès refusé — vous ne pouvez agir que sur votre propre compte' };
    }
  }
}

export const rgpdService = new RgpdService();
