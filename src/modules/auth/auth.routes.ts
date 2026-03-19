import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = Router();

// ── Routes publiques ──────────────────────────────────────────────────────
router.post('/register',         (req, res) => authController.register(req, res));
router.post('/login',            (req, res) => authController.login(req, res));
router.post('/refresh',          (req, res) => authController.refresh(req, res));
router.post('/forgot-password',  (req, res) => authController.forgotPassword(req, res));
router.post('/reset-password',   (req, res) => authController.resetPassword(req, res));
router.get( '/google',           (req, res) => authController.googleAuth(req, res));
router.get( '/google/callback',  (req, res) => authController.googleCallback(req, res));
router.post('/google/token',      (req, res) => authController.googleToken(req, res));

// ── Routes protégées ──────────────────────────────────────────────────────
router.get( '/me',     authMiddleware, (req, res) => authController.me(req, res));
router.post('/logout', authMiddleware, (req, res) => authController.logout(req, res));

export default router;