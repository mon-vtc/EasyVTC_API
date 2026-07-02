import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { env } from '../config/env.js';

// Initialiser SendGrid si la clé est définie (production)
if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}

// ── Logo EazyVTC embarqué ─────────────────────────────────────────────────────
const LOGO_B64 = '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';
const LOGO_SRC = `data:image/png;base64,${LOGO_B64}`;

// ── Couleurs charte EazyVTC ───────────────────────────────────────────────────
const C = {
  bordeaux:  '#4A1C1C',
  bordeauxL: '#6B2D2D',
  beige:     '#C9956A',
  beigeL:    '#F0E0D0',
  white:     '#FFFFFF',
  gray:      '#666666',
  lightGray: '#F5F5F5',
  border:    '#E8D5C4',
};

// ── Transporter Mailtrap (dev/staging) ───────────────────────────────────────
const mailtrapTransporter = nodemailer.createTransport({
  host: env.MAILTRAP_HOST,
  port: env.MAILTRAP_PORT,
  auth: { user: env.MAILTRAP_USER, pass: env.MAILTRAP_PASS },
});

// ── sendMail : dual-path SendGrid (prod) / Mailtrap (dev) ─────────────────────
async function sendMail(to: string, subject: string, html: string): Promise<void> {
  if (env.SENDGRID_API_KEY) {
    const from = env.SENDGRID_FROM_EMAIL
      ? { email: env.SENDGRID_FROM_EMAIL, name: env.SENDGRID_FROM_NAME ?? 'EazyVTC' }
      : env.MAIL_FROM;
    await sgMail.send({ to, from, subject, html });
  } else {
    await mailtrapTransporter.sendMail({
      from: `"EazyVTC" <${env.MAIL_FROM}>`,
      to, subject, html,
    });
  }
}

// ── Layout commun ─────────────────────────────────────────────────────────────
function layout(content: string, preview = ''): string {
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <title>EazyVTC</title></head>
    <body style="margin:0;padding:0;background:#F0E8E0;font-family:Helvetica,Arial,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;">${preview}</span>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#F0E8E0;padding:40px 20px;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:${C.bordeaux};border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <img src="${LOGO_SRC}" alt="EazyVTC" width="110" style="display:inline-block;"/>
            </td>
          </tr>
          <tr>
            <td style="background:${C.white};padding:40px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background:${C.bordeaux};border-radius:0 0 12px 12px;padding:22px 40px;text-align:center;">
              <p style="margin:0 0 6px;color:${C.beigeL};font-size:13px;">
                © ${new Date().getFullYear()} EazyVTC — Tous droits réservés</p>
              <p style="margin:0;color:${C.beige};font-size:12px;">
                Paiement directement au chauffeur · Espèces ou CB en fin de course</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    </body></html>`;
}

function btn(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:28px auto;">
    <tr><td style="background:${C.bordeaux};border-radius:8px;box-shadow:0 4px 12px rgba(74,28,28,0.3);">
      <a href="${href}" style="display:inline-block;padding:16px 36px;color:${C.white};
         text-decoration:none;font-size:16px;font-weight:bold;letter-spacing:0.5px;">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

function hr(): string {
  return `<hr style="border:none;border-top:2px solid ${C.beigeL};margin:28px 0;"/>`;
}

// =============================================================================
// 1. Email de bienvenue
// =============================================================================
export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  loginUrl = 'easyvtc://login'
): Promise<void> {
  const html = layout(`
    <h1 style="margin:0 0 6px;color:${C.bordeaux};font-size:26px;font-weight:bold;">
      Bienvenue, ${firstName} ! 🎉</h1>
    <p style="margin:0 0 24px;color:${C.beige};font-size:13px;font-weight:600;
              letter-spacing:1px;text-transform:uppercase;">Votre compte est activé</p>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Votre compte EazyVTC a été créé avec succès. Vous pouvez dès maintenant
      vous connecter et réserver votre premier trajet.</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.lightGray};border-radius:8px;border-left:4px solid ${C.beige};margin:20px 0;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 6px;color:${C.bordeaux};font-weight:bold;font-size:14px;">
           Comment ça marche ?</p>
        <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
          Réservez votre trajet → Un chauffeur vous est attribué manuellement →
          Réglez directement au chauffeur (espèces ou CB).</p>
      </td></tr>
    </table>
    ${btn('Se connecter à EazyVTC', loginUrl)}
    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Compte créé par erreur ? Contactez-nous :
      <a href="mailto:support@easyvtc.com"
         style="color:${C.bordeaux};text-decoration:none;font-weight:bold;">
        support@easyvtc.com</a></p>
  `, `Bienvenue ${firstName} ! Votre compte EazyVTC est prêt.`);

  await sendMail(to, 'Bienvenue sur EazyVTC 🚗', html);
}

// =============================================================================
// 2. Accès gestionnaire (créé par admin)
// =============================================================================
export async function sendManagerAccessEmail(
  to: string,
  firstName: string,
  password: string,
  loginUrl = 'easyvtc://login'
): Promise<void> {
  const html = layout(`
    <h1 style="margin:0 0 6px;color:${C.bordeaux};font-size:26px;font-weight:bold;">
      Votre accès gestionnaire EazyVTC</h1>
    <p style="margin:0 0 24px;color:${C.beige};font-size:13px;font-weight:600;
              letter-spacing:1px;text-transform:uppercase;">Identifiants de connexion</p>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Bonjour <strong>${firstName}</strong>,<br/>
      Un compte gestionnaire a été créé pour vous sur la plateforme EazyVTC.
      Voici vos identifiants de connexion :</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.lightGray};border-radius:8px;border-left:4px solid ${C.bordeaux};margin:0 0 24px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 12px;color:#555;font-size:14px;">
          <span style="display:inline-block;width:100px;color:${C.gray};">Identifiant :</span>
          <strong style="color:${C.bordeaux};">${to}</strong></p>
        <p style="margin:0;color:#555;font-size:14px;">
          <span style="display:inline-block;width:100px;color:${C.gray};">Mot de passe :</span>
          <strong style="color:${C.bordeaux};font-family:monospace;font-size:15px;">${password}</strong></p>
      </td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#FFF8F0;border-radius:8px;border-left:4px solid ${C.beige};margin:0 0 24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;color:#555;font-size:13px;line-height:1.6;">
          <strong style="color:${C.bordeaux};">Important :</strong>
          Pour des raisons de sécurité, veuillez modifier votre mot de passe dès votre première connexion.</p>
      </td></tr>
    </table>
    ${btn('Se connecter à EazyVTC', loginUrl)}
    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Vous n'êtes pas à l'origine de cette demande ? Contactez-nous immédiatement :
      <a href="mailto:support@easyvtc.com"
         style="color:${C.bordeaux};text-decoration:none;font-weight:bold;">
        support@easyvtc.com</a></p>
  `, `${firstName}, voici vos identifiants gestionnaire EazyVTC.`);

  await sendMail(to, 'Votre accès gestionnaire EazyVTC', html);
}

// =============================================================================
// 3. Réinitialisation du mot de passe
// =============================================================================
export async function sendResetPasswordEmail(
  to: string,
  firstName: string,
  resetLink: string
): Promise<void> {
  const html = layout(`
    <h1 style="margin:0 0 6px;color:${C.bordeaux};font-size:26px;font-weight:bold;">
      Réinitialisation du mot de passe</h1>
    <p style="margin:0 0 24px;color:${C.beige};font-size:13px;font-weight:600;
              letter-spacing:1px;text-transform:uppercase;">Demande de réinitialisation</p>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Bonjour <strong>${firstName}</strong>,<br/>
      Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte.</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#FFF5F0;border-radius:8px;border-left:4px solid #E53E3E;margin:0 0 20px;">
      <tr><td style="padding:14px 20px;">
        <p style="margin:0;color:#C53030;font-size:13px;line-height:1.5;">
          ⏱️ Ce lien est valide pendant <strong>1 heure</strong> uniquement.</p>
      </td></tr>
    </table>
    ${btn('Réinitialiser mon mot de passe', resetLink)}
    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Si vous n'avez pas fait cette demande, ignorez cet email.
      Votre mot de passe restera inchangé.</p>
  `, `${firstName}, réinitialisez votre mot de passe EazyVTC.`);

  await sendMail(to, 'Réinitialisation de votre mot de passe EazyVTC', html);
}

// =============================================================================
// 3. Alerte expiration document chauffeur (Sprint 2)
// =============================================================================
export async function sendDocumentExpiryAlert(
  to: string,
  firstName: string,
  docType: string,
  daysLeft: number
): Promise<void> {
  const urgency    = daysLeft <= 7;
  const alertColor = urgency ? '#E53E3E' : '#D97706';
  const alertBg    = urgency ? '#FFF5F0' : '#FFFBEB';
  const emoji      = urgency ? '🚨' : '⚠️';

  const html = layout(`
    <h1 style="margin:0 0 6px;color:${C.bordeaux};font-size:26px;font-weight:bold;">
      ${emoji} Document expirant bientôt</h1>
    <p style="margin:0 0 24px;color:${alertColor};font-size:13px;font-weight:600;
              letter-spacing:1px;text-transform:uppercase;">
      Action requise dans ${daysLeft} jours</p>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Bonjour <strong>${firstName}</strong>,</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${alertBg};border-radius:8px;border-left:4px solid ${alertColor};margin:0 0 20px;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 6px;color:${alertColor};font-weight:bold;font-size:14px;">
          Document concerné</p>
        <p style="margin:0 0 10px;color:#333;font-size:20px;font-weight:bold;">${docType}</p>
        <p style="margin:0;color:${alertColor};font-size:15px;">
          Expire dans <strong>${daysLeft} jour${daysLeft > 1 ? 's' : ''}</strong></p>
      </td></tr>
    </table>
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Mettez à jour ce document depuis votre espace chauffeur pour éviter
      toute interruption de service.</p>
    ${btn('Mettre à jour mes documents', 'easyvtc://documents')}
    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Support :
      <a href="mailto:support@easyvtc.com"
         style="color:${C.bordeaux};text-decoration:none;font-weight:bold;">
        support@easyvtc.com</a></p>
  `, `${firstName}, votre document ${docType} expire dans ${daysLeft} jours.`);

  await sendMail(to, `${emoji} Document expirant dans ${daysLeft} jours — EazyVTC`, html);
}

// =============================================================================
// 4. Réservation confirmée (Sprint 3)
// =============================================================================
export async function sendReservationConfirmedEmail(
  to: string,
  firstName: string,
  reservationRef: string,
  scheduledAt: string,
  pickup: string,
  destination: string,
  vehicleType: string,
  estimatedPrice: number
): Promise<void> {
  const html = layout(`
    <h1 style="margin:0 0 6px;color:${C.bordeaux};font-size:26px;font-weight:bold;">
       Réservation confirmée</h1>
    <p style="margin:0 0 24px;color:${C.beige};font-size:13px;font-weight:600;
              letter-spacing:1px;text-transform:uppercase;">
      Référence : ${reservationRef}</p>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Bonjour <strong>${firstName}</strong>, votre trajet est confirmé !</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.lightGray};border-radius:8px;overflow:hidden;margin:0 0 20px;">
      <tr style="background:${C.bordeaux};">
        <td colspan="2" style="padding:12px 20px;">
          <p style="margin:0;color:${C.white};font-weight:bold;font-size:13px;letter-spacing:0.5px;">
            DÉTAILS DU TRAJET</p>
        </td>
      </tr>
      <tr style="border-bottom:1px solid ${C.border};">
        <td style="padding:12px 20px;color:${C.gray};font-size:14px;width:38%;"> Date</td>
        <td style="padding:12px 20px;color:#333;font-size:14px;font-weight:600;">${scheduledAt}</td>
      </tr>
      <tr style="border-bottom:1px solid ${C.border};background:${C.white};">
        <td style="padding:12px 20px;color:${C.gray};font-size:14px;"> Départ</td>
        <td style="padding:12px 20px;color:#333;font-size:14px;font-weight:600;">${pickup}</td>
      </tr>
      <tr style="border-bottom:1px solid ${C.border};">
        <td style="padding:12px 20px;color:${C.gray};font-size:14px;"> Arrivée</td>
        <td style="padding:12px 20px;color:#333;font-size:14px;font-weight:600;">${destination}</td>
      </tr>
      <tr style="border-bottom:1px solid ${C.border};background:${C.white};">
        <td style="padding:12px 20px;color:${C.gray};font-size:14px;"> Véhicule</td>
        <td style="padding:12px 20px;color:#333;font-size:14px;font-weight:600;">${vehicleType}</td>
      </tr>
      <tr>
        <td style="padding:12px 20px;color:${C.gray};font-size:14px;"> Prix estimé</td>
        <td style="padding:12px 20px;color:${C.bordeaux};font-size:18px;font-weight:bold;">
          ${estimatedPrice.toFixed(2)} €</td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#F0FFF4;border-radius:8px;border-left:4px solid #38A169;margin:0 0 20px;">
      <tr><td style="padding:14px 20px;">
        <p style="margin:0;color:#276749;font-size:13px;line-height:1.5;">
           Paiement <strong>directement au chauffeur</strong> en fin de course
          (espèces ou CB).</p>
      </td></tr>
    </table>
    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Support :
      <a href="mailto:support@easyvtc.com"
         style="color:${C.bordeaux};text-decoration:none;font-weight:bold;">
        support@easyvtc.com</a></p>
  `, `${firstName}, votre trajet du ${scheduledAt} est confirmé.`);

  await sendMail(to, ` Réservation confirmée — ${reservationRef}`, html);
}

// =============================================================================
// 5. Notification générique (canal email du service notifications)
// =============================================================================

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  reservation_confirmed: { label: 'Réservation confirmée',  color: '#38A169' },
  trip_assigned:         { label: 'Course attribuée',        color: '#3182CE' },
  trip_reminder:         { label: 'Rappel de course',        color: '#D97706' },
  driver_arrived:        { label: 'Chauffeur arrivé',        color: '#4A1C1C' },
  invoice_available:     { label: 'Facture disponible',      color: '#38A169' },
  document_expiry:       { label: 'Document expirant',       color: '#E53E3E' },
  document_validated:    { label: 'Document validé',         color: '#38A169' },
  document_rejected:     { label: 'Document rejeté',         color: '#E53E3E' },
  reservation_cancelled: { label: 'Réservation annulée',     color: '#E53E3E' },
  new_message:           { label: 'Nouveau message',         color: '#3182CE' },
};

export async function sendNotificationEmail(
  to: string,
  firstName: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  const { label, color } = TYPE_LABELS[type] ?? { label: 'Notification', color: C.bordeaux };

  const html = layout(`
    <p style="margin:0 0 20px;">
      <span style="display:inline-block;background:${color};color:#fff;
                   font-size:12px;font-weight:bold;letter-spacing:0.8px;
                   text-transform:uppercase;padding:4px 12px;border-radius:20px;">
        ${label}
      </span>
    </p>
    <h2 style="margin:0 0 6px;color:${C.bordeaux};font-size:22px;font-weight:bold;">
      ${title}</h2>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 24px;">
      Bonjour <strong>${firstName}</strong>,</p>
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 24px;">${body}</p>
    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Support :
      <a href="mailto:support@easyvtc.com"
         style="color:${C.bordeaux};text-decoration:none;font-weight:bold;">
        support@easyvtc.com</a></p>
  `, `${firstName} — ${title}`);

  await sendMail(to, `${title} — EazyVTC`, html);
}

// =============================================================================
// 6. Confirmation de réinitialisation du mot de passe
export async function sendPasswordChangedEmail(
  to: string,
  firstName: string,
  loginUrl = 'easyvtc://login'
): Promise<void> {
  const html = layout(`
    <h1 style="margin:0 0 6px;color:${C.bordeaux};font-size:26px;font-weight:bold;">
       Mot de passe mis à jour</h1>
    <p style="margin:0 0 24px;color:${C.beige};font-size:13px;font-weight:600;
              letter-spacing:1px;text-transform:uppercase;">Confirmation de modification</p>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Bonjour <strong>${firstName}</strong>,</p>
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Votre mot de passe EazyVTC a bien été modifié. Vous pouvez maintenant
      vous connecter avec votre nouveau mot de passe.</p>

    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#F0FFF4;border-radius:8px;border-left:4px solid #38A169;margin:0 0 20px;">
      <tr><td style="padding:14px 20px;">
        <p style="margin:0;color:#276749;font-size:14px;line-height:1.5;">
           Si vous n'êtes pas à l'origine de cette modification,
          <strong>contactez immédiatement notre support</strong>.</p>
      </td></tr>
    </table>

    ${btn('Se connecter à EazyVTC', loginUrl)}

    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Support :
      <a href="mailto:support@easyvtc.com"
         style="color:${C.bordeaux};text-decoration:none;font-weight:bold;">
        support@easyvtc.com</a></p>
  `, `${firstName}, votre mot de passe EazyVTC a été modifié avec succès.`);

  await sendMail(to, ' Mot de passe EazyVTC modifié avec succès', html);
}

// =============================================================================
// 6. Email de bienvenue — Gestionnaire (compte créé par l'admin)
// =============================================================================
export async function sendManagerWelcomeEmail(
  to: string,
  firstName: string,
  tempPassword: string,
  loginUrl = 'easyvtc://login'
): Promise<void> {
  const html = layout(`
    <h1 style="margin:0 0 6px;color:${C.bordeaux};font-size:26px;font-weight:bold;">
      Bienvenue, ${firstName} !</h1>
    <p style="margin:0 0 24px;color:${C.beige};font-size:13px;font-weight:600;
              letter-spacing:1px;text-transform:uppercase;">Votre espace gestionnaire</p>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Bonjour <strong>${firstName}</strong>,</p>
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 24px;">
      Votre compte gestionnaire EazyVTC vient d'être créé par l'administrateur.
      Vous pouvez dès maintenant vous connecter et gérer les courses et réservations
      de la plateforme.</p>

    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.lightGray};border-radius:8px;border:1px solid ${C.border};margin:0 0 24px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 14px;color:${C.bordeaux};font-size:13px;font-weight:700;
                    letter-spacing:0.5px;text-transform:uppercase;">Vos identifiants de connexion</p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:6px 0;color:${C.gray};font-size:14px;width:40%;vertical-align:top;">
                Adresse email</td>
              <td style="padding:6px 0;color:#222;font-size:14px;font-weight:600;">
                ${to}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:${C.gray};font-size:14px;vertical-align:top;">
                Mot de passe temporaire</td>
              <td style="padding:6px 0;">
                <code style="background:${C.bordeaux};color:${C.white};padding:4px 10px;
                             border-radius:4px;font-size:14px;letter-spacing:1px;">
                  ${tempPassword}</code>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#FFF8E1;border-radius:8px;border-left:4px solid #F6AD55;margin:0 0 24px;">
      <tr><td style="padding:14px 20px;">
        <p style="margin:0;color:#744210;font-size:14px;line-height:1.5;">
          ⚠️ <strong>Important :</strong> Ce mot de passe est temporaire. Veuillez le modifier
          dès votre première connexion depuis les paramètres de votre compte.</p>
      </td></tr>
    </table>

    ${btn('Accéder à mon espace gestionnaire', loginUrl)}

    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Pour toute question, contactez votre administrateur ou notre support :
      <a href="mailto:support@easyvtc.com"
         style="color:${C.bordeaux};text-decoration:none;font-weight:bold;">
        support@easyvtc.com</a></p>
  `, `${firstName}, vos identifiants gestionnaire EazyVTC sont prêts.`);

  await sendMail(to, '🔑 Vos accès gestionnaire EazyVTC', html);
}

// =============================================================================
// 7. Email marketing générique (campagnes)
// =============================================================================
export async function sendMarketingEmail(
  to: string,
  firstName: string,
  subject: string,
  body: string,
): Promise<void> {
  const escaped = body.replace(/\n/g, '<br/>');

  const html = layout(`
    <h2 style="margin:0 0 20px;color:${C.bordeaux};font-size:22px;font-weight:bold;">
      Bonjour ${firstName},</h2>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 24px;">${escaped}</p>
    ${hr()}
    <p style="color:${C.gray};font-size:12px;line-height:1.5;margin:0;">
      Vous recevez cet email car vous avez accepté nos communications marketing.
      Pour vous désabonner, modifiez vos préférences dans l'application EazyVTC.</p>
  `, `${firstName} — ${subject}`);

  await sendMail(to, subject, html);
}