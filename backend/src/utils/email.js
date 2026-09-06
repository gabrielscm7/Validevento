/**
 * Wrapper de e-mail transacional via Resend.
 * Sem RESEND_API_KEY (dev/testes) apenas registra no log e não lança erro,
 * para não quebrar o fluxo de criação de usuários em ambiente local.
 */

function resendFrom() {
  return process.env.EMAIL_FROM || 'Validevento <noreply@validevento.com>';
}

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

async function sendMail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email:${process.env.NODE_ENV}] Envio suprimido (sem RESEND_API_KEY): ${subject} -> ${to}`);
    return { suppressed: true };
  }

  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: resendFrom(),
    to,
    subject,
    html,
  });

  if (error) {
    console.error('Falha ao enviar e-mail via Resend:', error);
  }
  return { error: error || null };
}

function activationHtml(name, link) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e293b;">Ative seu acesso — Validevento</h2>
      <p>Olá, <strong>${name}</strong>!</p>
      <p>Seu usuário foi cadastrado na plataforma Validevento. Clique no botão abaixo
         para definir sua senha e ativar seu acesso:</p>
      <p style="text-align:center;">
        <a href="${link}" style="background:#2563eb; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block;">
          Ativar acesso
        </a>
      </p>
      <p>Ou copie e cole este link no navegador:</p>
      <p><a href="${link}">${link}</a></p>
      <p>Este link expira em <strong>48 horas</strong>.</p>
      <p>Se você não solicitou este cadastro, ignore este e-mail.</p>
    </div>
  `;
}

function resetHtml(name, link) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e293b;">Recuperação de senha — Validevento</h2>
      <p>Olá, <strong>${name}</strong>!</p>
      <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo:</p>
      <p style="text-align:center;">
        <a href="${link}" style="background:#2563eb; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block;">
          Redefinir senha
        </a>
      </p>
      <p>Ou copie e cole este link no navegador:</p>
      <p><a href="${link}">${link}</a></p>
      <p>Este link expira em <strong>1 hora</strong>.</p>
      <p>Se você não solicitou a recuperação, ignore este e-mail.</p>
    </div>
  `;
}

// Link de ativação: expira em 48h
async function sendActivationEmail(to, name, token) {
  const link = `${frontendUrl()}/ativar?token=${token}`;
  return sendMail({
    to,
    subject: 'Ative seu acesso — Validevento',
    html: activationHtml(name, link),
  });
}

// Link de redefinição de senha: expira em 1h
async function sendPasswordResetEmail(to, name, token) {
  const link = `${frontendUrl()}/recuperar?token=${token}`;
  return sendMail({
    to,
    subject: 'Recuperação de senha — Validevento',
    html: resetHtml(name, link),
  });
}

module.exports = {
  sendActivationEmail,
  sendPasswordResetEmail,
  sendMail,
};
