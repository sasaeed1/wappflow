'use strict';
// Platform-level email (WappFlow → a customer), separate from a workspace's own
// SMTP. Uses SMTP_* from the server .env; quietly returns { skipped } when unset so
// callers never fail because mail is not configured. Same settings the password
// reset flow (account-recovery.js) reads.
const nodemailer = require('nodemailer');

function platformTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || '') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

async function sendPlatformMail({ to, subject, text, html }) {
  const t = platformTransport();
  if (!t || !to) return { skipped: true };
  await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
  return { sent: true };
}

module.exports = { sendPlatformMail };
