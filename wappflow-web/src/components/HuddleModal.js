'use client';

import { useEffect, useRef, useState } from 'react';
import { Video, VideoOff, Phone, PhoneOff, Mic, MicOff, MonitorUp, Users, Loader2, AlertCircle, Hand, Maximize2, Minimize2 } from 'lucide-react';
import { commsAPI } from '../lib/api';

/**
 * HuddleModal — self-hosted LiveKit voice/video/screenshare room (replaces the old
 * public-Jitsi iframe). Connects with a token minted by POST /api/comms/livekit/token.
 *
 * Presented as a DOCKED PANEL, not a modal: no backdrop, nothing behind it is
 * blocked, and the rest of the app stays usable during a call — the way Slack
 * huddles work. 'mini' by default, expandable, hang up from the header.
 *
 * Props:
 *   open           - boolean, whether the panel is shown
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
  const [raisedSelf, setRaisedSelf] = useState(false);
  const [hands, setHands] = useState({});       // identity → raised?
  const [roster, setRoster] = useState([]);     // [{ identity, name, isLocal }]
  const [showRoster, setShowRoster] = useState(false);
  // 'mini' (Slack's default) | 'expanded'. Remembered across huddles.
  const [size, setSize] = useState(() => {
    try { return localStorage.getItem('wf_huddle_size') === 'expanded' ? 'expanded' : 'mini'; } catch { return 'mini'; }
  });
  useEffect(() => { try { localStorage.setItem('wf_huddle_size', size); } catch {} }, [size]);

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
      const refreshRoster = () => {
        const list = [];
        if (room.localParticipant) list.push({ identity: room.localParticipant.identity, name: `${displayName || 'You'} (you)`, isLocal: true });
        const rps = room.remoteParticipants || room.participants;
        if (rps) rps.forEach(p => list.push({ identity: p.identity, name: p.name || p.identity, isLocal: false }));
        setRoster(list);
      };
      const onParticipants = () => { refreshCount(); refreshRoster(); };

      room
        .on(RoomEvent.TrackSubscribed, (track, pub, participant) => attach(track, participant))
        .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => detach(track, participant))
        .on(RoomEvent.LocalTrackPublished, (pub) => pub.track && attach(pub.track, room.localParticipant))
        .on(RoomEvent.LocalTrackUnpublished, (pub) => pub.track && detach(pub.track, room.localParticipant))
        .on(RoomEvent.ParticipantConnected, onParticipants)
        .on(RoomEvent.ParticipantDisconnected, (p) => { onParticipants(); if (p?.identity) setHands(h => { const n = { ...h }; delete n[p.identity]; return n; }); })
        .on(RoomEvent.DataReceived, (payload, participant) => {
          try { const msg = JSON.parse(new TextDecoder().decode(payload)); if (msg && msg.kind === 'hand') setHands(h => ({ ...h, [participant?.identity || msg.identity]: !!msg.raised })); } catch {}
        })
        .on(RoomEvent.Disconnected, () => { if (!cancelled) onClose?.(); });

      try {
        await room.connect(tok.url, tok.token);
        if (cancelled) { room.disconnect(); return; }
        await room.localParticipant.setMicrophoneEnabled(true);
        if (startWithVideo) await room.localParticipant.setCameraEnabled(true);
        refreshCount(); refreshRoster();
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
  const toggleHand = async () => {
    const r = roomRef.current; if (!r) return;
    const next = !raisedSelf; setRaisedSelf(next);
    const id = r.localParticipant?.identity;
    if (id) setHands(h => ({ ...h, [id]: next }));
    try { await r.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ kind: 'hand', raised: next, identity: id })), { reliable: true }); } catch {}
  };
  const raisedCount = Object.values(hands).filter(Boolean).length;

  return (
    // A huddle is not a modal. Slack docks it in a corner and lets you carry on
    // working — read other channels, type, switch module — while you talk. This
    // used to be a full-screen overlay with a dark backdrop, which took the whole
    // app hostage for the length of the call and made a quick huddle feel like a
    // meeting. No backdrop now, so nothing behind it is blocked, and clicking away
    // cannot accidentally hang up on somebody.
    <div className={`hd-dock ${size}`} role="dialog" aria-label="Huddle">
      <div className="hd-card">
        <div className="hd-head">
          <div className="hd-title">
            <div className="hd-icon">{startWithVideo ? <Video size={16} /> : <Phone size={16} />}</div>
            <div>
              <div className="hd-title-text">{startWithVideo ? 'Video huddle' : 'Voice huddle'}</div>
              <div className="hd-title-sub"><Users size={11} /> {phase === 'live' ? `${count} in call` : 'Live'}</div>
            </div>
          </div>
          <div className="hd-head-actions">
            <button className="hd-chip" onClick={() => setSize(size === 'mini' ? 'expanded' : 'mini')}
                    aria-label={size === 'mini' ? 'Expand huddle' : 'Shrink huddle'}
                    title={size === 'mini' ? 'Expand' : 'Shrink'}>
              {size === 'mini' ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
            </button>
            <button className="hd-chip hd-hang" onClick={onClose} aria-label="Leave huddle" title="Leave">
              <PhoneOff size={15} />
            </button>
          </div>
        </div>

        <div className="hd-frame-wrap">
          {phase === 'connecting' && <div className="hd-state"><Loader2 className="hd-spin" size={26} /><div>Connecting…</div></div>}
          {phase === 'unconfigured' && <div className="hd-state"><AlertCircle size={26} /><div>Calls aren’t enabled yet.<br /><span className="hd-dim">An admin needs to configure LiveKit (see LIVEKIT-SETUP.md).</span></div></div>}
          {phase === 'error' && <div className="hd-state"><AlertCircle size={26} /><div>{error}</div></div>}
          <div ref={tilesRef} className="hd-tiles" style={{ display: phase === 'live' ? 'grid' : 'none' }} />

          {/* Roster panel */}
          {phase === 'live' && showRoster && (
            <div className="hd-roster">
              <div className="hd-roster-head">In this call · {roster.length}</div>
              {roster.map(p => (
                <div key={p.identity} className="hd-roster-row">
                  <span className="hd-roster-dot" />
                  <span className="hd-roster-name">{p.name}</span>
                  {hands[p.identity] && <Hand size={13} color="#fbbf24" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {phase === 'live' && (
          <div className="hd-controls">
            <button className={`hd-ctl ${micOn ? '' : 'off'}`} onClick={toggleMic} title={micOn ? 'Mute' : 'Unmute'}>{micOn ? <Mic size={18} /> : <MicOff size={18} />}</button>
            <button className={`hd-ctl ${camOn ? '' : 'off'}`} onClick={toggleCam} title={camOn ? 'Stop video' : 'Start video'}>{camOn ? <Video size={18} /> : <VideoOff size={18} />}</button>
            <button className={`hd-ctl ${sharing ? 'on' : ''}`} onClick={toggleShare} title="Share screen"><MonitorUp size={18} /></button>
            <button className={`hd-ctl ${raisedSelf ? 'on' : ''}`} onClick={toggleHand} title={raisedSelf ? 'Lower hand' : 'Raise hand'}><Hand size={18} /></button>
            <button className={`hd-ctl ${showRoster ? 'on' : ''}`} onClick={() => setShowRoster(s => !s)} title="Participants">
              <Users size={18} />{raisedCount > 0 && <span className="hd-ctl-badge">{raisedCount}✋</span>}
            </button>
            <button className="hd-ctl leave" onClick={onClose} title="Leave"><PhoneOff size={18} /></button>
          </div>
        )}
      </div>

      <style>{`
        /* Docked bottom-LEFT: the floating assistants own bottom-right, and Slack
           puts a huddle on the sidebar side anyway. No backdrop — the app stays
           usable, which is the entire point of a huddle. */
        .hd-dock { position: fixed; left: 16px; bottom: 16px; z-index: 9998; display: flex; animation: hd-pop 0.2s cubic-bezier(0.34,1.56,0.64,1); }
        .hd-dock.mini .hd-card { width: 340px; height: 260px; }
        .hd-dock.expanded .hd-card { width: min(720px, calc(100vw - 32px)); height: min(520px, calc(100vh - 32px)); }
        @keyframes hd-pop { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .hd-card { background: #0b0d16; border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.55); transition: width .18s ease, height .18s ease; }
        .hd-head-actions { display: flex; align-items: center; gap: 6px; }
        .hd-chip { width: 30px; height: 30px; background: rgba(255,255,255,0.06); color: #d1d5db; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; display: grid; place-items: center; cursor: pointer; }
        .hd-chip:hover { background: rgba(255,255,255,0.12); color: #fff; }
        .hd-hang { background: rgba(239,68,68,0.16); color: #fca5a5; border-color: rgba(239,68,68,0.32); }
        .hd-hang:hover { background: #ef4444; color: #fff; border-color: #ef4444; }
        @keyframes hd-pop { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .hd-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; }
        .hd-title { display: flex; align-items: center; gap: 12px; }
        .hd-icon { width: 34px; height: 34px; border-radius: 9px; background: linear-gradient(135deg,#6366f1,#a855f7); color: #fff; display: grid; place-items: center; }
        .hd-title-text { font-size: 15px; font-weight: 700; color: #f3f4f6; }
        .hd-title-sub { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #9ca3af; margin-top: 2px; }
        .hd-close { width: 34px; height: 34px; background: rgba(255,255,255,0.06); color: #d1d5db; border: 1px solid rgba(255,255,255,0.12); border-radius: 9px; display: grid; place-items: center; cursor: pointer; }
        .hd-close:hover { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
        .hd-frame-wrap { flex: 1; background: #000; position: relative; display: flex; align-items: center; justify-content: center; }
        .hd-tiles { position: absolute; inset: 0; padding: 8px; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); align-content: center; overflow: auto; }
        .hd-tile { position: relative; background: #11131d; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; aspect-ratio: 16/9; }
        .hd-video { width: 100%; height: 100%; object-fit: cover; }
        .hd-tag { position: absolute; left: 8px; bottom: 8px; padding: 3px 8px; font-size: 11px; color: #e7eaf3; background: rgba(0,0,0,0.55); border-radius: 6px; }
        .hd-state { color: #cbd5e1; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; font-size: 14px; line-height: 1.5; }
        .hd-dim { color: #7c8398; font-size: 12px; }
        .hd-spin { animation: hd-rot 1s linear infinite; } @keyframes hd-rot { to { transform: rotate(360deg); } }
        .hd-controls { display: flex; gap: 8px; align-items: center; justify-content: center; padding: 10px; flex-wrap: wrap; background: rgba(255,255,255,0.02); border-top: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; }
        .hd-ctl { width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,0.08); color: #e7eaf3; border: 1px solid rgba(255,255,255,0.12); display: grid; place-items: center; cursor: pointer; transition: all .15s; }
        .hd-ctl:hover { background: rgba(255,255,255,0.14); }
        .hd-ctl.off { background: rgba(239,68,68,0.18); color: #fca5a5; border-color: rgba(239,68,68,0.35); }
        .hd-ctl.on { background: rgba(99,102,241,0.25); color: #c7d2fe; border-color: rgba(99,102,241,0.5); }
        .hd-ctl.leave { background: #ef4444; color: #fff; border-color: #ef4444; }
        .hd-ctl.leave:hover { background: #dc2626; }
        .hd-ctl { position: relative; }
        .hd-ctl-badge { position: absolute; top: -4px; right: -6px; background: #fbbf24; color: #1f2937; font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 999px; }
        .hd-roster { position: absolute; top: 8px; right: 8px; width: 180px; max-height: calc(100% - 24px); overflow: auto; background: rgba(11,13,22,0.92); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 10px 12px; backdrop-filter: blur(6px); }
        .hd-roster-head { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .hd-roster-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 13px; color: #e7eaf3; }
        .hd-roster-dot { width: 7px; height: 7px; border-radius: 999px; background: #34d399; flex-shrink: 0; }
        .hd-roster-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 768px) { .hd-dock { left: 8px; right: 8px; bottom: 8px; } .hd-dock .hd-card { width: 100%; height: 240px; } .hd-dock.expanded .hd-card { height: min(420px, calc(100vh - 16px)); } }
      `}</style>
    </div>
  );
}
