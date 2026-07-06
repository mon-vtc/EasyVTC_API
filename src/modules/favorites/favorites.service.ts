// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Destinations Favorites
// Sprint 6 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import type { Favorite, CreateFavoriteDto } from './favorites.types.js';
import type { UserRole } from '../auth/auth.types.js';

// Nombre maximum de favoris par utilisateur (protection anti-abus)
const MAX_FAVORITES = 20;

export class FavoritesService {

  // ──────────────────────────────────────────────────────────────────────────
  // GET /users/:id/favorites
  // ──────────────────────────────────────────────────────────────────────────
  async list(userId: string, requesterId: string, requesterRole: UserRole): Promise<Favorite[]> {
    this._checkAccess(userId, requesterId, requesterRole);

    const { data, error } = await supabaseAdmin
      .from('user_favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Favorites] list error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des favoris' };
    }

    return (data ?? []) as Favorite[];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /users/:id/favorites
  // ──────────────────────────────────────────────────────────────────────────
  async create(userId: string, requesterId: string, requesterRole: UserRole, dto: CreateFavoriteDto): Promise<Favorite> {
    this._checkAccess(userId, requesterId, requesterRole);

    // Vérifier la limite de favoris par utilisateur
    const { count } = await supabaseAdmin
      .from('user_favorites')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if ((count ?? 0) >= MAX_FAVORITES) {
      throw {
        status: 422,
        message: `Vous avez atteint le nombre maximum de favoris (${MAX_FAVORITES}). Supprimez-en un avant d'en ajouter un nouveau.`,
      };
    }

    const { data, error } = await supabaseAdmin
      .from('user_favorites')
      .insert({
        user_id: userId,
        label:   dto.label,
        address: dto.address,
        lat:     dto.lat ?? null,
        lng:     dto.lng ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Favorites] create error:', error);
      throw { status: 500, message: "Erreur lors de l'ajout du favori" };
    }

    return data as Favorite;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /users/:id/favorites/:favId
  // ──────────────────────────────────────────────────────────────────────────
  async delete(userId: string, favId: string, requesterId: string, requesterRole: UserRole): Promise<void> {
    this._checkAccess(userId, requesterId, requesterRole);

    // Vérifier que le favori existe et appartient bien à cet utilisateur
    const { data: existing } = await supabaseAdmin
      .from('user_favorites')
      .select('id')
      .eq('id', favId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      throw { status: 404, message: 'Favori introuvable' };
    }

    const { error } = await supabaseAdmin
      .from('user_favorites')
      .delete()
      .eq('id', favId);

    if (error) {
      console.error('[Favorites] delete error:', error);
      throw { status: 500, message: 'Erreur lors de la suppression du favori' };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Contrôle d'accès
  // Seuls les clients (propres favoris) et les admins sont autorisés.
  // Les drivers et managers n'ont pas accès aux favoris.
  // ──────────────────────────────────────────────────────────────────────────
  private _checkAccess(userId: string, requesterId: string, requesterRole: UserRole): void {
    if (requesterRole === 'admin') return;

    if (requesterRole !== 'client') {
      throw { status: 403, message: 'Accès refusé' };
    }

    if (requesterId !== userId) {
      throw { status: 403, message: 'Accès refusé' };
    }
  }
}

export const favoritesService = new FavoritesService();
