import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../modules/auth/auth.types.js';
import type { ManagerPermission } from '../modules/admin/admin.types.js';

/**
 * Middleware pour vérifier que l'utilisateur a un des rôles autorisés.
 * À utiliser APRÈS authMiddleware.
 * 
 * @example
 * router.get('/admin-only', authMiddleware, requireRole('admin'), handler);
 * router.get('/staff', authMiddleware, requireRole('admin', 'manager'), handler);
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Vérifier que l'utilisateur est authentifié
    if (!req.user) {
      res.status(401).json({ 
        ok: false, 
        message: 'Authentification requise' 
      });
      return;
    }

    // Vérifier le rôle
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ 
        ok: false, 
        message: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.',
        required_roles: allowedRoles,
        your_role: req.user.role,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware pour vérifier que l'utilisateur est admin
 */
export const requireAdmin = requireRole('admin');

/**
 * Middleware pour vérifier que l'utilisateur est admin ou gestionnaire
 */
export const requireStaff = requireRole('admin', 'manager');

/**
 * Middleware pour vérifier que l'utilisateur est chauffeur
 */
export const requireDriver = requireRole('driver');

/**
 * Middleware de permission fine pour les gestionnaires.
 * Les admins passent toujours (bypass total).
 * Les managers doivent avoir la permission explicitement accordée.
 *
 * @example
 * router.get('/reservations', requireStaff, requirePermission('view_reservations'), handler);
 */
export function requirePermission(permission: ManagerPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ ok: false, message: 'Authentification requise' });
      return;
    }
    if (req.user.role === 'admin') {
      next();
      return;
    }
    if (!req.user.permissions.includes(permission)) {
      res.status(403).json({
        ok: false,
        message: 'Accès refusé. Permission insuffisante.',
        required_permission: permission,
      });
      return;
    }
    next();
  };
}

/**
 * Variante de requirePermission pour les routes mixtes (ex: client + manager).
 * - client  : passe toujours
 * - admin   : passe toujours
 * - manager : doit avoir la permission explicitement accordée
 *
 * @example
 * // Client peut annuler ses propres courses, manager doit avoir cancel_reservation
 * router.patch('/:id/cancel',
 *   requireRole('client', 'admin', 'manager'),
 *   requirePermissionIfManager('cancel_reservation'),
 *   handler
 * );
 */
export function requirePermissionIfManager(permission: ManagerPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ ok: false, message: 'Authentification requise' });
      return;
    }
    if (req.user.role !== 'manager') {
      next();
      return;
    }
    if (!req.user.permissions.includes(permission)) {
      res.status(403).json({
        ok: false,
        message: 'Accès refusé. Permission insuffisante.',
        required_permission: permission,
      });
      return;
    }
    next();
  };
}
