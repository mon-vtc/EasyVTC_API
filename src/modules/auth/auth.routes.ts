import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { authStrictLimiter, registerLimiter, refreshLimiter } from '../../config/rate-limit.js';

const router = Router();

// ── Routes publiques ──────────────────────────────────────────────────────
router.post('/register',         registerLimiter,    (req, res) => authController.register(req, res));
router.post('/login',            authStrictLimiter,  (req, res) => authController.login(req, res));
router.post('/refresh',          refreshLimiter, (req, res) => authController.refresh(req, res));
router.post('/forgot-password',  authStrictLimiter,  (req, res) => authController.forgotPassword(req, res));
router.post('/reset-password',   authStrictLimiter,  (req, res) => authController.resetPassword(req, res));
router.get( '/google',           (req, res) => authController.googleAuth(req, res));
router.get( '/google/callback',  (req, res) => authController.googleCallback(req, res));
router.post('/google/token',      (req, res) => authController.googleToken(req, res));

// ── Routes protégées ──────────────────────────────────────────────────────
router.get( '/me',              authMiddleware, (req, res) => authController.me(req, res));
router.post('/logout',          authMiddleware, (req, res) => authController.logout(req, res));
router.post('/change-password', authMiddleware, (req, res) => authController.changePassword(req, res));

export default router;