'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web-Audio based sound service for WappFlow notifications.
 *
 * 5 distinct sound profiles, all generated in code (no audio files needed).
 *
 *   reminder   - dual-note chime (high → low) — for due reminders
 *   whatsapp   - short ascending pop — for incoming WhatsApp messages
 *   team       - subtle double-tap — for team chat messages
 *   newLead    - bright ascending arpeggio — for new lead arrival
 *   system     - single soft ping — for generic notifications
 *
 * Each sound respects per-channel mute preferences stored in localStorage.
 */

const SoundContext = createContext(null);

const PREFS_KEY = 'wf_sound_prefs_v1';
const VOLUME_KEY = 'wf_sound_volume_v1';

const DEFAULT_PREFS = {
  reminder: true,
  whatsapp: true,
  team: true,
  newLead: true,
  system: true,
};

export function SoundProvider({ children }) {
  const audioCtxRef = useRef(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [volume, setVolume] = useState(0.55);
  const lastPlayedRef = useRef({}); // throttle map per channel

  // Load prefs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(stored) });
      const v = localStorage.getItem(VOLUME_KEY);
      if (v) setVolume(Math.max(0, Math.min(1, parseFloat(v))));
    } catch {}
  }, []);

  const persistPrefs = (next) => {
    setPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch {}
  };

  const persistVolume = (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    try { localStorage.setItem(VOLUME_KEY, String(clamped)); } catch {}
  };

  const getCtx = () => {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  const playNote = useCallback((ctx, { freq, when, duration, type = 'sine', vol = 0.5, attack = 0.005, release = 0.12 }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol * volume, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + release);
  }, [volume]);

  const play = useCallback((kind, opts = {}) => {
    // Throttle: don't play same sound twice within 250ms
    const now = Date.now();
    if (lastPlayedRef.current[kind] && now - lastPlayedRef.current[kind] < 250) return;
    lastPlayedRef.current[kind] = now;

    if (!prefs[kind] && !opts.force) return;
    const ctx = getCtx();
    if (!ctx) return;

    const t = ctx.currentTime;

    try {
      switch (kind) {
        case 'reminder': {
          // Dual-note chime: high then low, bell-like
          playNote(ctx, { freq: 1318.51, when: t,        duration: 0.32, type: 'sine',     vol: 0.45 }); // E6
          playNote(ctx, { freq: 987.77,  when: t + 0.14, duration: 0.45, type: 'sine',     vol: 0.4  }); // B5
          playNote(ctx, { freq: 659.26,  when: t,        duration: 0.5,  type: 'triangle', vol: 0.15 }); // E5 harmonic
          break;
        }
        case 'whatsapp': {
          // Short ascending pop — playful, distinct
          playNote(ctx, { freq: 587.33, when: t,        duration: 0.07, type: 'triangle', vol: 0.4 }); // D5
          playNote(ctx, { freq: 880.00, when: t + 0.05, duration: 0.1,  type: 'triangle', vol: 0.45 }); // A5
          playNote(ctx, { freq: 1174.66, when: t + 0.1, duration: 0.13, type: 'sine',    vol: 0.5 }); // D6
          break;
        }
        case 'team': {
          // Soft double-tap — subtle, doesn't interrupt
          playNote(ctx, { freq: 740.0, when: t,        duration: 0.06, type: 'sine', vol: 0.32 }); // F#5
          playNote(ctx, { freq: 740.0, when: t + 0.08, duration: 0.08, type: 'sine', vol: 0.28 });
          break;
        }
        case 'newLead': {
          // Bright ascending arpeggio — celebratory
          playNote(ctx, { freq: 523.25, when: t,        duration: 0.1, type: 'triangle', vol: 0.35 }); // C5
          playNote(ctx, { freq: 659.26, when: t + 0.08, duration: 0.1, type: 'triangle', vol: 0.38 }); // E5
          playNote(ctx, { freq: 783.99, when: t + 0.16, duration: 0.12, type: 'triangle', vol: 0.4 }); // G5
          playNote(ctx, { freq: 1046.5, when: t + 0.24, duration: 0.18, type: 'sine',    vol: 0.42 }); // C6
          break;
        }
        case 'system':
        default: {
          // Single soft ping
          playNote(ctx, { freq: 880.0, when: t, duration: 0.18, type: 'sine', vol: 0.32 });
          playNote(ctx, { freq: 1318.5, when: t, duration: 0.12, type: 'sine', vol: 0.1 });
          break;
        }
      }
    } catch {}
  }, [prefs, volume, playNote]);

  // Preview a sound (ignores mute state)
  const preview = useCallback((kind) => play(kind, { force: true }), [play]);

  const value = {
    play,
    preview,
    prefs,
    setPref: (kind, on) => persistPrefs({ ...prefs, [kind]: on }),
    setAllPrefs: persistPrefs,
    volume,
    setVolume: persistVolume,
  };

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    // Safe fallback — no-op
    return {
      play: () => {},
      preview: () => {},
      prefs: DEFAULT_PREFS,
      setPref: () => {},
      setAllPrefs: () => {},
      volume: 0.5,
      setVolume: () => {},
    };
  }
  return ctx;
}

export const SOUND_KINDS = [
  { id: 'reminder', label: 'Reminders',       desc: 'When a scheduled reminder is due' },
  { id: 'whatsapp', label: 'WhatsApp message', desc: 'When a new WhatsApp message arrives' },
  { id: 'team',     label: 'Team chat',        desc: 'When a teammate sends a message' },
  { id: 'newLead',  label: 'New lead',         desc: 'When a new lead is captured' },
  { id: 'system',   label: 'System',           desc: 'For generic notifications' },
];
