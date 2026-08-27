'use client';

// ════════════════════════════════════════════════════════════════════════════
//  Upload manager — progress, speed, ETA, and uploads that survive navigation.
//
//  Uploads used to be a bare `await api.post(fd)` inside the page component with
//  a boolean "uploading" flag: no percentage, no idea how long a 2GB shoot would
//  take, and nothing to look at but a spinner. Worse, everything about the
//  upload — the promise, the result handling, the error banner — belonged to a
//  component that unmounts the moment you navigate, so leaving the shoot page
//  meant losing sight of the transfer entirely.
//
//  This store lives ABOVE the router (mounted in providers.js), so a transfer
//  keeps running and keeps reporting while you work somewhere else, and a toast
//  tells you when it lands.
//
//  HONEST LIMIT: this survives client-side navigation, not page teardown. An
//  in-flight XHR dies with the document, so closing the tab or hard-reloading
//  still cancels the upload — the browser gives a page no way to keep a request
//  alive past its own lifetime. (The Background Fetch API can, but it is
//  Chrome-only and needs a different server contract; noted, not pretended.)
//  We do warn before a reload discards work in progress.
// ════════════════════════════════════════════════════════════════════════════

import { useSyncExternalStore } from 'react';
import api from './api';
import { toast } from '@/components/ui/Toast';

let jobs = [];                 // newest first
const listeners = new Set();
const emit = () => { jobs = [...jobs]; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => jobs;

const uid = () => 'up_' + Math.random().toString(36).slice(2, 10);

export const isActive = (j) => j.status === 'uploading' || j.status === 'queued';

/** Bytes → "1.4 GB". */
export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

/** Seconds → "about 2 min left" / "12s left". Vague on purpose when it is vague. */
export function fmtEta(sec) {
  if (sec == null || !isFinite(sec) || sec < 0) return '';
  if (sec < 10) return 'almost done';
  if (sec < 60) return `${Math.round(sec)}s left`;
  const m = Math.round(sec / 60);
  if (m < 60) return `about ${m} min left`;
  const h = Math.floor(m / 60);
  return `about ${h}h ${m % 60}m left`;
}

/**
 * Start an upload.
 *
 * @param {object}   o
 * @param {string}   o.url        API path (same shape api.post takes)
 * @param {FormData} o.formData
 * @param {string}   o.label      what the user sees ("12 photos")
 * @param {number}   o.bytes      total size, for speed/ETA
 * @param {Function} [o.onDone]   called with the response on success
 * @returns {string} job id
 */
export function startUpload({ url, formData, label, bytes = 0, onDone }) {
  const id = uid();
  const controller = new AbortController();
  const job = {
    id, label, bytes, loaded: 0, percent: 0,
    status: 'uploading', error: null,
    bytesPerSec: 0, etaSec: null,
    startedAt: Date.now(), controller,
  };
  jobs = [job, ...jobs];
  emit();

  // Speed from a short trailing window, not from the whole transfer: an average
  // taken since t=0 keeps reporting the slow first seconds long after the line
  // has come up to speed, and the ETA lies for the rest of the upload.
  let samples = [{ t: Date.now(), loaded: 0 }];

  api.post(url, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal: controller.signal,
    onUploadProgress: (e) => {
      const total = e.total || bytes || 0;
      const loaded = e.loaded || 0;
      const now = Date.now();
      samples.push({ t: now, loaded });
      while (samples.length > 2 && now - samples[0].t > 5000) samples.shift();
      const first = samples[0];
      const dt = (now - first.t) / 1000;
      const bps = dt > 0.4 ? (loaded - first.loaded) / dt : 0;
      const remaining = total ? total - loaded : 0;
      update(id, {
        loaded, bytes: total || bytes,
        percent: total ? Math.min(99, Math.round((loaded / total) * 100)) : 0,
        bytesPerSec: bps,
        etaSec: bps > 0 && remaining > 0 ? remaining / bps : null,
      });
    },
  })
    .then((res) => {
      update(id, { status: 'done', percent: 100, etaSec: 0, bytesPerSec: 0 });
      toast.success(`${label} uploaded`, { description: 'Processing thumbnails…' });
      try { onDone?.(res); } catch {}
      // Leave it on screen briefly so a completed row is actually seen.
      setTimeout(() => remove(id), 6000);
    })
    .catch((err) => {
      if (controller.signal.aborted) { remove(id); return; }
      const msg = err?.response?.data?.error || err?.message || 'Upload failed';
      update(id, { status: 'error', error: msg });
      toast.error(`${label} failed to upload`, { description: msg });
    });

  return id;
}

function update(id, patch) {
  const i = jobs.findIndex((j) => j.id === id);
  if (i === -1) return;
  jobs[i] = { ...jobs[i], ...patch };
  emit();
}

export function remove(id) {
  jobs = jobs.filter((j) => j.id !== id);
  emit();
}

export function cancel(id) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return;
  try { j.controller?.abort(); } catch {}
  remove(id);
}

/** Subscribe a component to the live job list. */
export function useUploads() {
  return useSyncExternalStore(subscribe, snapshot, () => jobs);
}

export const activeCount = () => jobs.filter(isActive).length;
