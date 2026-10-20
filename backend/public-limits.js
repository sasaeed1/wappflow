'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Rate limits for PUBLIC links (galleries, contracts, booking pages, shops).
//
//  These routes are reachable by anyone holding a link, and several of them do
//  expensive work per request — a ZIP of a whole gallery, an AI answer, a lead +
//  booking. The global per-IP limit (500 / 15 min) is far too loose for that.
//  Keyed per link AND per IP, so one noisy visitor cannot lock out the client the
//  link was meant for. RATE_LIMIT_PUBLIC_SCALE multiplies every limit (tests).
// ════════════════════════════════════════════════════════════════════════════
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const scale = () => Math.max(1, Number(process.env.RATE_LIMIT_PUBLIC_SCALE) || 1);

function publicLimiter(name, { max, minutes, message }) {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    max: () => max * scale(),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${req.params.token || req.params.slug || ''}:${ipKeyGenerator(req.ip || '')}`,
    message: { error: message || 'Too many requests from this connection — please try again in a few minutes.' },
  });
}

module.exports = {
  publicLimiter,
  // Shared presets, so a route's limit says what kind of work it guards.
  heavy: (name) => publicLimiter(name, { max: 5, minutes: 15, message: 'That’s already being prepared — please wait a few minutes before asking again.' }),
  ai: (name) => publicLimiter(name, { max: 10, minutes: 15, message: 'Too many questions in a short time — please try again in a few minutes.' }),
  create: (name) => publicLimiter(name, { max: 10, minutes: 15 }),
  interact: (name) => publicLimiter(name, { max: 120, minutes: 10 }),
};
