import { Router } from 'express';
import multer from 'multer';
import { usersController } from './users.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

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

// Toutes les routes nécessitent un token valide
router.use(authMiddleware);

router.get(   '/me',        (req, res) => usersController.getMe(req, res));
router.patch( '/me',        (req, res) => usersController.updateMe(req, res));
router.post(  '/me/avatar', upload.single('avatar'), (req, res) => usersController.uploadAvatar(req, res));
router.delete('/me',        (req, res) => usersController.deleteMe(req, res));

export default router;