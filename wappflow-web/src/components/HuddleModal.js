'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Video, VideoOff, Phone, PhoneOff, Mic, MicOff, MonitorUp, Users, Loader2, AlertCircle } from 'lucide-react';
import { commsAPI } from '../lib/api';

/**
 * HuddleModal — self-hosted LiveKit voice/video/screenshare room (replaces the old
 * public-Jitsi iframe). Connects with a token minted by POST /api/comms/livekit/token.
 *
 * Props:
 *   open           - boolean, whether the modal is visible
 *   onClose        - close handler
 *   roomName       - raw room key (the backend namespaces it per workspace)
 *   displayName    - shown to peers
 *   startWithVideo - true → camera on (video huddle); false → audio-only (voice huddle)
 *
 * Media elements are attached imperatively (livekit track.attach()) into the tiles
 * container — robust against React reconciliation for dynamic participants.
 */
export default function HuddleModal({ open, onClose, roomName, displayName, startWithVideo = false }) {
  const [phase, setPhase] = useState('idle');        // idle | connecting | live | error | unconfigured
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(!!startWithVideo);
  const [sharing, setSharing] = useState(false);
  const [count, setCount] = useState(1);

  const roomRef = useRef(null);
  const tilesRef = useRef(null);
  const tileMap = useRef(new Map()); // participantSid:trackSid -> wrapper element

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let room = null;

    (async () => {
      setPhase('connecting'); setError('');
      // 1) Mint a token (also tells us if LiveKit is configured on the server).
      let tok;
      try {
        const res = await commsAPI.livekitToken(roomName || 'huddle');
        tok = res.data;
      } catch (e) {
        if (cancelled) return;
        if (e?.response?.status === 503) { setPhase('unconfigured'); return; }
        setError(e?.response?.data?.error || 'Could not start the huddle.'); setPhase('error'); return;
      }
      if (cancelled) return;

      // 2) Lazy-load livekit-client (keeps it out of the main bundle / SSR).
      let LK;
      try { LK = await import('livekit-client'); }
      catch { setError('Video engine not installed (run: npm i livekit-client).'); setPhase('error'); return; }
      if (cancelled) return;

      const { Room, RoomEvent, Track } = LK;
      room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      const attach = (track, participant) => {
        if (track.kind === Track.Kind.Audio && participant?.isLocal) return; // never play our own mic
        const el = track.attach();
        const key = `${participant?.sid || 'local'}:${track.sid || track.kind}`;
        if (track.kind === Track.Kind.Video) {
          const wrap = document.createElement('div');
          wrap.className = 'hd-tile';
          el.className = 'hd-video';
          const tag = document.createElement('div');
          tag.className = 'hd-tag';
          tag.textContent = participant?.isLocal ? `${displayName || 'You'} (you)` : (participant?.identity || 'Guest');
          wrap.appendChild(el); wrap.appendChild(tag);
          tileMap.current.set(key, wrap);
          tilesRef.current && tilesRef.current.appendChild(wrap);
        } else {
          el.style.display = 'none';
          tileMap.current.set(key, el);
          document.body.appendChild(el);
        }
      };
      const detach = (track, participant) => {
        const key = `${participant?.sid || 'local'}:${track.sid || track.kind}`;
        try { track.detach().forEach(e => e.remove()); } catch {}
        const w = tileMap.current.get(key); if (w) { w.remove(); tileMap.current.delete(key); }
      };
      const refreshCount = () => setCount(1 + (room.remoteParticipants ? room.remoteParticipants.size : (room.participants?.size || 0)));

      room
        .on(RoomEvent.TrackSubscribed, (track, pub, participant) => attach(track, participant))
        .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => detach(track, participant))
        .on(RoomEvent.LocalTrackPublished, (pub) => pub.track && attach(pub.track, room.localParticipant))
        .on(RoomEvent.LocalTrackUnpublished, (pub) => pub.track && detach(pub.track, room.localParticipant))
        .on(RoomEvent.ParticipantConnected, refreshCount)
        .on(RoomEvent.ParticipantDisconnected, refreshCount)
        .on(RoomEvent.Disconnected, () => { if (!cancelled) onClose?.(); });

      try {
        await room.connect(tok.url, tok.token);
        if (cancelled) { room.disconnect(); return; }
        await room.localParticipant.setMicrophoneEnabled(true);
        if (startWithVideo) await room.localParticipant.setCameraEnabled(true);
        refreshCount();
        setPhase('live');
      } catch (e) {
        if (cancelled) return;
        setError('Failed to connect to the huddle server.'); setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      try { roomRef.current && roomRef.current.disconnect(); } catch {}
      roomRef.current = null;
      tileMap.current.forEach(el => { try { el.remove(); } catch {} });
      tileMap.current.clear();
    };
  }, [open, roomName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const toggleMic = async () => { const r = roomRef.current; if (!r) return; const next = !micOn; await r.localParticipant.setMicrophoneEnabled(next); setMicOn(next); };
  const toggleCam = async () => { const r = roomRef.current; if (!r) return; const next = !camOn; await r.localParticipant.setCameraEnabled(next); setCamOn(next); };
  const toggleShare = async () => { const r = roomRef.current; if (!r) return; const next = !sharing; try { await r.localParticipant.setScreenShareEnabled(next); setSharing(next); } catch {} };

  return (
    <div className="hd-overlay" onClick={onClose}>
      <div className="hd-card" onClick={(e) => e.stopPropagation()}>
        <div className="hd-head">
          <div className="hd-title">
            <div className="hd-icon">{startWithVideo ? <Video size={16} /> : <Phone size={16} />}</div>
            <div>
              <div className="hd-title-text">{startWithVideo ? 'Video huddle' : 'Voice huddle'}</div>
              <div className="hd-title-sub"><Users size={11} /> {phase === 'live' ? `${count} in call` : 'Live'} · self-hosted</div>
            </div>
          </div>
          <button className="hd-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="hd-frame-wrap">
          {phase === 'connecting' && <div className="hd-state"><Loader2 className="hd-spin" size={26} /><div>Connecting…</div></div>}
          {phase === 'unconfigured' && <div className="hd-state"><AlertCircle size={26} /><div>Calls aren’t enabled yet.<br /><span className="hd-dim">An admin needs to configure LiveKit (see LIVEKIT-SETUP.md).</span></div></div>}
          {phase === 'error' && <div className="hd-state"><AlertCircle size={26} /><div>{error}</div></div>}
          <div ref={tilesRef} className="hd-tiles" style={{ display: phase === 'live' ? 'grid' : 'none' }} />
        </div>

        {phase === 'live' && (
          <div className="hd-controls">
            <button className={`hd-ctl ${micOn ? '' : 'off'}`} onClick={toggleMic} title={micOn ? 'Mute' : 'Unmute'}>{micOn ? <Mic size={18} /> : <MicOff size={18} />}</button>
            <button className={`hd-ctl ${camOn ? '' : 'off'}`} onClick={toggleCam} title={camOn ? 'Stop video' : 'Start video'}>{camOn ? <Video size={18} /> : <VideoOff size={18} />}</button>
            <button className={`hd-ctl ${sharing ? 'on' : ''}`} onClick={toggleShare} title="Share screen"><MonitorUp size={18} /></button>
            <button className="hd-ctl leave" onClick={onClose} title="Leave"><PhoneOff size={18} /></button>
          </div>
        )}
      </div>

      <style>{`
        .hd-overlay { position: fixed; inset: 0; z-index: 9998; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 24px; animation: hd-fade 0.15s ease-out; }
        @keyframes hd-fade { from { opacity: 0; } to { opacity: 1; } }
        .hd-card { width: 100%; height: 100%; max-width: 1100px; max-height: 720px; background: #0b0d16; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 40px 100px rgba(0,0,0,0.6); animation: hd-pop 0.2s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes hd-pop { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .hd-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; }
        .hd-title { display: flex; align-items: center; gap: 12px; }
        .hd-icon { width: 34px; height: 34px; border-radius: 9px; background: linear-gradient(135deg,#6366f1,#a855f7); color: #fff; display: grid; place-items: center; }
        .hd-title-text { font-size: 15px; font-weight: 700; color: #f3f4f6; }
        .hd-title-sub { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #9ca3af; margin-top: 2px; }
        .hd-close { width: 34px; height: 34px; background: rgba(255,255,255,0.06); color: #d1d5db; border: 1px solid rgba(255,255,255,0.12); border-radius: 9px; display: grid; place-items: center; cursor: pointer; }
        .hd-close:hover { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
        .hd-frame-wrap { flex: 1; background: #000; position: relative; display: flex; align-items: center; justify-content: center; }
        .hd-tiles { position: absolute; inset: 0; padding: 12px; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); align-content: center; overflow: auto; }
        .hd-tile { position: relative; background: #11131d; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; aspect-ratio: 16/9; }
        .hd-video { width: 100%; height: 100%; object-fit: cover; }
        .hd-tag { position: absolute; left: 8px; bottom: 8px; padding: 3px 8px; font-size: 11px; color: #e7eaf3; background: rgba(0,0,0,0.55); border-radius: 6px; }
        .hd-state { color: #cbd5e1; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; font-size: 14px; line-height: 1.5; }
        .hd-dim { color: #7c8398; font-size: 12px; }
        .hd-spin { animation: hd-rot 1s linear infinite; } @keyframes hd-rot { to { transform: rotate(360deg); } }
        .hd-controls { display: flex; gap: 10px; align-items: center; justify-content: center; padding: 14px; background: rgba(255,255,255,0.02); border-top: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; }
        .hd-ctl { width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.08); color: #e7eaf3; border: 1px solid rgba(255,255,255,0.12); display: grid; place-items: center; cursor: pointer; transition: all .15s; }
        .hd-ctl:hover { background: rgba(255,255,255,0.14); }
        .hd-ctl.off { background: rgba(239,68,68,0.18); color: #fca5a5; border-color: rgba(239,68,68,0.35); }
        .hd-ctl.on { background: rgba(99,102,241,0.25); color: #c7d2fe; border-color: rgba(99,102,241,0.5); }
        .hd-ctl.leave { background: #ef4444; color: #fff; border-color: #ef4444; }
        .hd-ctl.leave:hover { background: #dc2626; }
        @media (max-width: 768px) { .hd-overlay { padding: 0; } .hd-card { max-height: none; border-radius: 0; } }
      `}</style>
    </div>
  );
}
