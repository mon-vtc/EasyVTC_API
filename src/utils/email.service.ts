import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { env } from '../config/env.js';

// Initialiser SendGrid si la clé est définie (production)
if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}

// ── Logo EazyVTC (hébergé sur Supabase Storage, bucket public) ─────────────────
const LOGO_SRC = 'https://gmeaptypqcgxytshadez.supabase.co/storage/v1/object/public/public-assets/email/logo-white.png';

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
  success:   '#38A169',
  successBg: '#F0FFF4',
  successTx: '#276749',
  danger:    '#E53E3E',
  dangerBg:  '#FFF5F0',
  dangerTx:  '#C53030',
  warning:   '#D97706',
  warningBg: '#FFFBEB',
  warningTx: '#744210',
  info:      '#3182CE',
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
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <meta name="color-scheme" content="light"/>
    <meta name="supported-color-schemes" content="light"/>
    <title>EazyVTC</title>
    <style>
      body { -webkit-font-smoothing:antialiased; }
      a { color:${C.bordeaux}; }
      @media only screen and (max-width:600px) {
        .evtc-wrap { padding:24px 12px !important; }
        .evtc-header { padding:24px 28px !important; }
        .evtc-content { padding:28px 24px !important; }
        .evtc-footer { padding:20px 24px !important; }
        .evtc-h1 { font-size:21px !important; }
      }
    </style>
    </head>
    <body style="margin:0;padding:0;background:#F0E8E0;font-family:Helvetica,Arial,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           class="evtc-wrap" style="background:#F0E8E0;padding:40px 20px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td class="evtc-header" style="background:${C.bordeaux};border-radius:14px 14px 0 0;padding:30px 40px;text-align:center;">
              <img src="${LOGO_SRC}" alt="EazyVTC" width="100" style="display:inline-block;height:auto;border:0;"/>
            </td>
          </tr>
          <tr>
            <td class="evtc-content" style="background:${C.white};padding:40px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
              ${content}
            </td>
          </tr>
          <tr>
            <td class="evtc-footer" style="background:${C.bordeaux};border-radius:0 0 14px 14px;padding:22px 40px;text-align:center;">
              <p style="margin:0 0 6px;color:${C.beigeL};font-size:13px;">
                © ${new Date().getFullYear()} EazyVTC — Tous droits réservés</p>
              <p style="margin:0;color:${C.beige};font-size:12px;">
                Paiement directement au chauffeur · Espèces ou CB en fin de course</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;color:#B08A7A;font-size:11px;">EazyVTC · France &amp; Sénégal</p>
      </td></tr>
    </table>
    </body></html>`;
}

// En-tête standard d'un email : titre + kicker coloré + séparateur
function header(title: string, kicker: string, kickerColor = C.beige): string {
  return `
    <h1 class="evtc-h1" style="margin:0 0 8px;color:${C.bordeaux};font-size:24px;font-weight:800;line-height:1.3;">
      ${title}</h1>
    <p style="margin:0 0 24px;color:${kickerColor};font-size:12px;font-weight:700;
              letter-spacing:1.2px;text-transform:uppercase;">${kicker}</p>
    ${hr()}`;
}

function btn(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto;">
    <tr><td style="background:${C.bordeaux};border-radius:10px;box-shadow:0 4px 12px rgba(74,28,28,0.25);">
      <a href="${href}" style="display:inline-block;padding:16px 36px;color:${C.white};
         text-decoration:none;font-size:16px;font-weight:bold;letter-spacing:0.5px;border-radius:10px;">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

function hr(): string {
  return `<hr style="border:none;border-top:2px solid ${C.beigeL};margin:26px 0;"/>`;
}

// Encart coloré (info / succès / alerte / danger) avec bordure gauche
function callout(icon: string, html: string, bg: string, border: string, textColor: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background:${bg};border-radius:8px;border-left:4px solid ${border};margin:0 0 20px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0;color:${textColor};font-size:14px;line-height:1.6;">
        ${icon ? `<span style="margin-right:6px;">${icon}</span>` : ''}${html}</p>
    </td></tr>
  </table>`;
}

// Ligne icône + libellé + valeur dans un tableau de détails
function detailRow(icon: string, label: string, value: string, opts: { strong?: boolean; alt?: boolean } = {}): string {
  const bg = opts.alt ? `background:${C.white};` : '';
  const valueStyle = opts.strong
    ? `color:${C.bordeaux};font-size:18px;font-weight:bold;`
    : `color:#222;font-size:14px;font-weight:600;`;
  return `<tr style="border-bottom:1px solid ${C.border};${bg}">
    <td style="padding:12px 20px;color:${C.gray};font-size:14px;width:40%;">${icon} ${label}</td>
    <td style="padding:12px 20px;${valueStyle}">${value}</td>
  </tr>`;
}

const footerSupport = (): string => `
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Une question ? Notre support est là :
      <a href="mailto:support@easyvtc.com"
         style="color:${C.bordeaux};text-decoration:none;font-weight:bold;">
        support@easyvtc.com</a></p>`;

// =============================================================================
// 1. Email de bienvenue
// =============================================================================
export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  loginUrl = 'easyvtc://login'
): Promise<void> {
  const html = layout(`
    ${header(`Bienvenue, ${firstName} ! 🎉`, 'Votre compte est activé')}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Votre compte EazyVTC a été créé avec succès. Vous pouvez dès maintenant
      vous connecter et réserver votre premier trajet.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.lightGray};border-radius:8px;border-left:4px solid ${C.beige};margin:20px 0;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 8px;color:${C.bordeaux};font-weight:bold;font-size:14px;">
          🚗 Comment ça marche ?</p>
        <p style="margin:0;color:#555;font-size:14px;line-height:1.7;">
          1. Réservez votre trajet<br/>
          2. Un chauffeur vous est attribué manuellement<br/>
          3. Réglez directement au chauffeur (espèces ou CB)</p>
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
    ${header('Votre accès gestionnaire', 'Identifiants de connexion')}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Bonjour <strong>${firstName}</strong>,<br/>
      Un compte gestionnaire a été créé pour vous sur la plateforme EazyVTC.
      Voici vos identifiants de connexion :</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.lightGray};border-radius:8px;border-left:4px solid ${C.bordeaux};margin:0 0 24px;">
      <tr><td style="padding:20px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding:0 0 12px;color:${C.gray};font-size:14px;width:150px;vertical-align:top;">📧 Identifiant</td>
            <td style="padding:0 0 12px;"><strong style="color:${C.bordeaux};">${to}</strong></td>
          </tr>
          <tr>
            <td style="color:${C.gray};font-size:14px;vertical-align:top;">🔑 Mot de passe</td>
            <td><strong style="color:${C.bordeaux};font-family:monospace;font-size:15px;">${password}</strong></td>
          </tr>
        </table>
      </td></tr>
    </table>
    ${callout('⚠️', '<strong style="color:' + C.bordeaux + ';">Important :</strong> Pour des raisons de sécurité, veuillez modifier votre mot de passe dès votre première connexion.', '#FFF8F0', C.beige, '#555')}
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
    ${header('Réinitialisation du mot de passe', 'Demande de réinitialisation', C.danger)}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Bonjour <strong>${firstName}</strong>,<br/>
      Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte.</p>
    ${callout('⏱️', 'Ce lien est valide pendant <strong>1 heure</strong> uniquement.', C.dangerBg, C.danger, C.dangerTx)}
    ${btn('Réinitialiser mon mot de passe', resetLink)}
    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Si vous n'avez pas fait cette demande, ignorez cet email.
      Votre mot de passe restera inchangé.</p>
  `, `${firstName}, réinitialisez votre mot de passe EazyVTC.`);

  await sendMail(to, 'Réinitialisation de votre mot de passe EazyVTC', html);
}

// =============================================================================
// 4. Alerte expiration document chauffeur (Sprint 2)
// =============================================================================
export async function sendDocumentExpiryAlert(
  to: string,
  firstName: string,
  docType: string,
  daysLeft: number
): Promise<void> {
  const urgency    = daysLeft <= 7;
  const alertColor = urgency ? C.danger : C.warning;
  const alertBg    = urgency ? C.dangerBg : C.warningBg;
  const emoji      = urgency ? '🚨' : '⚠️';

  const html = layout(`
    ${header(`${emoji} Document expirant bientôt`, `Action requise dans ${daysLeft} jours`, alertColor)}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Bonjour <strong>${firstName}</strong>,</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${alertBg};border-radius:8px;border-left:4px solid ${alertColor};margin:0 0 20px;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 6px;color:${alertColor};font-weight:bold;font-size:14px;">
          📄 Document concerné</p>
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
    ${footerSupport()}
  `, `${firstName}, votre document ${docType} expire dans ${daysLeft} jours.`);

  await sendMail(to, `${emoji} Document expirant dans ${daysLeft} jours — EazyVTC`, html);
}

// =============================================================================
// 5. Réservation confirmée (Sprint 3)
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
    ${header('✅ Réservation confirmée', `Référence : ${reservationRef}`, C.success)}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Bonjour <strong>${firstName}</strong>, votre trajet est confirmé !</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.lightGray};border-radius:8px;overflow:hidden;margin:0 0 20px;">
      <tr style="background:${C.bordeaux};">
        <td colspan="2" style="padding:12px 20px;">
          <p style="margin:0;color:${C.white};font-weight:bold;font-size:13px;letter-spacing:0.5px;">
            DÉTAILS DU TRAJET</p>
        </td>
      </tr>
      ${detailRow('📅', 'Date', scheduledAt)}
      ${detailRow('📍', 'Départ', pickup, { alt: true })}
      ${detailRow('🏁', 'Arrivée', destination)}
      ${detailRow('🚗', 'Véhicule', vehicleType, { alt: true })}
      <tr>
        <td style="padding:12px 20px;color:${C.gray};font-size:14px;">💶 Prix estimé</td>
        <td style="padding:12px 20px;color:${C.bordeaux};font-size:18px;font-weight:bold;">
          ${estimatedPrice.toFixed(2)} €</td>
      </tr>
    </table>
    ${callout('💰', 'Paiement <strong>directement au chauffeur</strong> en fin de course (espèces ou CB).', C.successBg, C.success, C.successTx)}
    ${hr()}
    ${footerSupport()}
  `, `${firstName}, votre trajet du ${scheduledAt} est confirmé.`);

  await sendMail(to, `✅ Réservation confirmée — ${reservationRef}`, html);
}

// =============================================================================
// 6. Notification générique (canal email du service notifications)
// =============================================================================

const TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  reservation_confirmed: { label: 'Réservation confirmée',  color: C.success, icon: '✅' },
  trip_assigned:         { label: 'Course attribuée',        color: C.info,    icon: '🚗' },
  trip_reminder:         { label: 'Rappel de course',        color: C.warning, icon: '⏰' },
  driver_arrived:        { label: 'Chauffeur arrivé',        color: C.bordeaux, icon: '📍' },
  invoice_available:     { label: 'Facture disponible',      color: C.success, icon: '🧾' },
  document_expiry:       { label: 'Document expirant',       color: C.danger,  icon: '⚠️' },
  document_validated:    { label: 'Document validé',         color: C.success, icon: '✅' },
  document_rejected:     { label: 'Document rejeté',         color: C.danger,  icon: '❌' },
  reservation_cancelled: { label: 'Réservation annulée',     color: C.danger,  icon: '🚫' },
  new_message:           { label: 'Nouveau message',         color: C.info,    icon: '💬' },
};

export async function sendNotificationEmail(
  to: string,
  firstName: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  const { label, color, icon } = TYPE_LABELS[type] ?? { label: 'Notification', color: C.bordeaux, icon: '🔔' };

  const html = layout(`
    <p style="margin:0 0 20px;">
      <span style="display:inline-block;background:${color};color:#fff;
                   font-size:12px;font-weight:bold;letter-spacing:0.8px;
                   text-transform:uppercase;padding:5px 14px;border-radius:20px;">
        ${icon} ${label}
      </span>
    </p>
    <h2 style="margin:0 0 6px;color:${C.bordeaux};font-size:22px;font-weight:bold;">
      ${title}</h2>
    ${hr()}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 24px;">
      Bonjour <strong>${firstName}</strong>,</p>
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 24px;">${body}</p>
    ${hr()}
    ${footerSupport()}
  `, `${firstName} — ${title}`);

  await sendMail(to, `${title} — EazyVTC`, html);
}

// =============================================================================
// 7. Confirmation de réinitialisation du mot de passe
// =============================================================================
export async function sendPasswordChangedEmail(
  to: string,
  firstName: string,
  loginUrl = 'easyvtc://login'
): Promise<void> {
  const html = layout(`
    ${header('✅ Mot de passe mis à jour', 'Confirmation de modification', C.success)}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Bonjour <strong>${firstName}</strong>,</p>
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Votre mot de passe EazyVTC a bien été modifié. Vous pouvez maintenant
      vous connecter avec votre nouveau mot de passe.</p>
    ${callout('🛡️', 'Si vous n\'êtes pas à l\'origine de cette modification, <strong>contactez immédiatement notre support</strong>.', C.successBg, C.success, C.successTx)}
    ${btn('Se connecter à EazyVTC', loginUrl)}
    ${hr()}
    ${footerSupport()}
  `, `${firstName}, votre mot de passe EazyVTC a été modifié avec succès.`);

  await sendMail(to, '✅ Mot de passe EazyVTC modifié avec succès', html);
}

// =============================================================================
// 8. Code promo attribué (bulkAssign admin)
// =============================================================================
export async function sendPromoCodeEmail(
  to: string,
  firstName: string,
  code: string,
  discountLabel: string,
  validUntil?: string | null,
): Promise<void> {
  const html = layout(`
    ${header('🎁 Un code promo pour vous !', 'Offre exclusive EazyVTC', C.success)}
    <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Bonjour <strong>${firstName}</strong>,<br/>
      Un code promo vient de vous être attribué. Profitez-en dès votre prochaine réservation !</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.lightGray};border-radius:8px;border:2px dashed ${C.beige};margin:0 0 20px;">
      <tr><td style="padding:24px;text-align:center;">
        <p style="margin:0 0 10px;color:${C.gray};font-size:12px;font-weight:700;
                  letter-spacing:1px;text-transform:uppercase;">Votre code</p>
        <p style="margin:0 0 12px;color:${C.bordeaux};font-size:28px;font-weight:800;
                  letter-spacing:2px;font-family:monospace;">${code}</p>
        <p style="margin:0;color:${C.success};font-size:16px;font-weight:700;">${discountLabel}</p>
      </td></tr>
    </table>
    ${validUntil ? callout('⏱️', `Valable jusqu'au <strong>${validUntil}</strong>.`, C.warningBg, C.warning, C.warningTx) : ''}
    ${btn('Réserver mon trajet', 'easyvtc://reservation/new')}
    ${hr()}
    ${footerSupport()}
  `, `${firstName}, votre code promo ${code} vous attend !`);

  await sendMail(to, '🎁 Votre code promo EazyVTC', html);
}

// =============================================================================
// 9. Email marketing générique (campagnes)
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
