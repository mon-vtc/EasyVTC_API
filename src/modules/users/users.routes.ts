import { Router } from 'express';
import multer from 'multer';
import { usersController } from './users.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';

const router = Router();

// Multer en mémoire (pas de disque) — le buffer est passé directement à Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Utilisez JPG, PNG ou WebP.'));
    }
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// Toutes les routes nécessitent un token valide
// ══════════════════════════════════════════════════════════════════════════════
router.use(authMiddleware);

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES UTILISATEUR (self)
// ══════════════════════════════════════════════════════════════════════════════
router.get(   '/me',        (req, res) => usersController.getMe(req, res));
router.patch( '/me',        (req, res) => usersController.updateMe(req, res));
router.post(  '/me/avatar', upload.single('avatar'), (req, res) => usersController.uploadAvatar(req, res));

// Note: DELETE /me a été retiré — la désactivation de compte passe par l'admin

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN (gestion des utilisateurs)
// ══════════════════════════════════════════════════════════════════════════════
router.get(   '/',            requireRole('admin'),  (req, res) => usersController.listUsers(req, res));
router.get(   '/:id',         requireRole('admin'),  (req, res) => usersController.getUserById(req, res));
router.patch( '/:id/status',  requireRole('admin'),  (req, res) => usersController.changeUserStatus(req, res));

export default router;