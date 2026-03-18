import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// ── Logo EasyVTC embarqué ─────────────────────────────────────────────────────
const LOGO_B64 = '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HYXgcWnZrDqzG3MH2XQVlJcKKGtoamGpppmB8U0Tw5j2ncQRsIXzOU30a6UsYYBl1bLXiWhJzfQ1QL4HE7yBmC09bSOtUsjE6j5R8l/GzOmuM/B9AUXn/CnhRYYrI2x4jstfa58tslORURdvyXDsyPaptSadtFVTHrNxXHGdmbZaSdhHrZt7lnyx7I+YmnHJql4kiykVV3TwgtFlE13J3+ate35FPRSknsLmhvtVaY38KV8kL6fB1gdC5wIFXcXAlvWI2HLPtcR1L2ONbL0czyqoeZF46WMX4WwhhOpqMUmGenqI3RMoXAOfVkjawNO8dJOwZ7V8/LhNBUV9RPTUrKSCSVz44GOLhE0nMNBdtOQ2Znas3FGIb1ie7yXa/XGevrJNhkld5o4NaNzR1DILVrUx6OivPcyMnI6z8dkERFYKwREQBERAEREAREQBERAEREAREQBERAEREBJMB27nNwdWyNzjp/N63nd6t/qUwrLVbqt+vUUcUj+Lssie8KI4YxHBbqUUdTTkRhxIkj2k59IUnhv9nlbrNr4m9T82n2qvPlvZsYjp6Si2vz2ZtJS09JFyVNCyJmeeTRlmu5aufEFnhaS6ujd1MzcT6lGcQYpkq43U1A10MLtjnnznDo6guVCUmT2ZNVUfP7IxsZXRtwuXJQuzggza0jc48StEiKylpaMOybsk5P2ERF6cBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAf/9k=';
const LOGO_SRC = `data:image/png;base64,${LOGO_B64}`;

// ── Couleurs charte EasyVTC ───────────────────────────────────────────────────
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

// ── Transporter Mailtrap ──────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: env.MAILTRAP_HOST,
  port: env.MAILTRAP_PORT,
  auth: { user: env.MAILTRAP_USER, pass: env.MAILTRAP_PASS },
});

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  await transporter.sendMail({
    from: `"EasyVTC" <${env.MAIL_FROM}>`,
    to, subject, html,
  });
}

// ── Layout commun ─────────────────────────────────────────────────────────────
function layout(content: string, preview = ''): string {
  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <title>EasyVTC</title></head>
    <body style="margin:0;padding:0;background:#F0E8E0;font-family:Helvetica,Arial,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;">${preview}</span>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#F0E8E0;padding:40px 20px;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:${C.bordeaux};border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <img src="${LOGO_SRC}" alt="EasyVTC" width="110" style="display:inline-block;"/>
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
                © ${new Date().getFullYear()} EasyVTC — Tous droits réservés</p>
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
      Votre compte EasyVTC a été créé avec succès. Vous pouvez dès maintenant
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
    ${btn('Se connecter à EasyVTC', loginUrl)}
    ${hr()}
    <p style="color:${C.gray};font-size:13px;line-height:1.6;margin:0;">
      Compte créé par erreur ? Contactez-nous :
      <a href="mailto:support@easyvtc.com"
         style="color:${C.bordeaux};text-decoration:none;font-weight:bold;">
        support@easyvtc.com</a></p>
  `, `Bienvenue ${firstName} ! Votre compte EasyVTC est prêt.`);

  await sendMail(to, 'Bienvenue sur EasyVTC 🚗', html);
}

// =============================================================================
// 2. Réinitialisation du mot de passe
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
  `, `${firstName}, réinitialisez votre mot de passe EasyVTC.`);

  await sendMail(to, 'Réinitialisation de votre mot de passe EasyVTC', html);
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

  await sendMail(to, `${emoji} Document expirant dans ${daysLeft} jours — EasyVTC`, html);
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