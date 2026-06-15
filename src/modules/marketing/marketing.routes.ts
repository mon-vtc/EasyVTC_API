// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Marketing
// Sprint 6 — EazyVTC
//
// Montage dans app.ts :
//   app.use('/admin/marketing', adminMarketingRouter)
//   app.use('/users',           userMarketingRouter)
//
// Endpoints résultants :
//   GET    /admin/marketing/clients                   Statistiques + liste clients opt-in
//   GET    /admin/marketing/campaigns                 Liste des campagnes (paginée)
//   GET    /admin/marketing/campaigns/:id             Détail d'une campagne
//   POST   /admin/marketing/campaigns                 Créer une campagne (brouillon)
//   PATCH  /admin/marketing/campaigns/:id             Modifier un brouillon
//   DELETE /admin/marketing/campaigns/:id             Supprimer un brouillon
//   POST   /admin/marketing/campaigns/:id/send        Envoyer une campagne
//   GET    /users/me/marketing-consents               Consulter ses consentements marketing
//   PATCH  /users/me/marketing-consents               Mettre à jour ses consentements
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware }        from '../../middlewares/auth.middleware.js';
import { requireAdmin, requireStaff } from '../../middlewares/role.middleware.js';
import { marketingController }   from './marketing.controller.js';

// ── Routes admin ──────────────────────────────────────────────────────────────
export const adminMarketingRouter = Router();
adminMarketingRouter.use(authMiddleware);
adminMarketingRouter.use(requireAdmin);

// Base clients
adminMarketingRouter.get('/clients', (req, res) => marketingController.listClients(req, res));

// Campagnes
adminMarketingRouter.get(
  '/campaigns',
  (req, res) => marketingController.listCampaigns(req, res),
);
adminMarketingRouter.get(
  '/campaigns/:id',
  (req, res) => marketingController.getCampaignById(req, res),
);
adminMarketingRouter.post(
  '/campaigns',
  (req, res) => marketingController.createCampaign(req, res),
);
adminMarketingRouter.patch(
  '/campaigns/:id',
  (req, res) => marketingController.updateCampaign(req, res),
);
adminMarketingRouter.delete(
  '/campaigns/:id',
  (req, res) => marketingController.deleteCampaign(req, res),
);
adminMarketingRouter.post(
  '/campaigns/:id/send',
  (req, res) => marketingController.sendCampaign(req, res),
);

// ── Route utilisateur — consentements marketing ───────────────────────────────
export const userMarketingRouter = Router();
userMarketingRouter.use(authMiddleware);

userMarketingRouter.get(
  '/me/marketing-consents',
  (req, res) => marketingController.getMyMarketingConsents(req, res),
);

userMarketingRouter.patch(
  '/me/marketing-consents',
  (req, res) => marketingController.updateMyMarketingConsents(req, res),
);
