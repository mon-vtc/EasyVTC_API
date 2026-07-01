import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../database/supabase/client.js';
import type { AuthUser, UserRole } from '../modules/auth/auth.types.js';
import type { ManagerPermission } from '../modules/admin/admin.types.js';

// ─────────────────────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE — Vérifie le JWT Supabase et injecte req.user
// ─────────────────────────────────────────────────────────────────────────────
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      ok: false,
      message: 'Token manquant. Ajoutez Authorization: Bearer <token>',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ ok: false, message: 'Token invalide' });
    return;
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({
      ok: false,
      message: 'Token expiré ou invalide. Reconnectez-vous.',
    });
    return;
  }

  // Récupérer le profil depuis public.users
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, email, role, first_name, last_name, phone, status, deleted_at, created_at')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    res.status(401).json({ ok: false, message: 'Profil introuvable' });
    return;
  }

  // Vérifier soft delete et statut actif
  if (profile.deleted_at !== null || profile.status !== 'active') {
    res.status(403).json({ ok: false, message: 'Compte désactivé. Contactez le support.' });
    return;
  }

  let permissions: ManagerPermission[] = [];
  if (profile.role === 'manager') {
    const { data: permsData } = await supabaseAdmin
      .from('manager_permissions')
      .select('permission')
      .eq('manager_id', profile.id);
    permissions = (permsData ?? []).map(r => r.permission as ManagerPermission);
  }

  req.user = { ...profile, permissions } as AuthUser;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE MIDDLEWARE — Vérifie que l'utilisateur a le bon rôle
// Usage : requireRole('admin') ou requireRole('admin', 'manager')
// ─────────────────────────────────────────────────────────────────────────────
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ ok: false, message: 'Non authentifié' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        ok: false,
        message: `Accès refusé. Rôle requis : ${roles.join(' ou ')}`,
      });
      return;
    }

    next();
  };
}