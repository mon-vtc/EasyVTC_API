import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../modules/auth/auth.types.js';

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
