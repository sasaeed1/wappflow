'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Video, Phone, Copy, Check, Users } from 'lucide-react';

/**
 * HuddleModal — embeds a Jitsi Meet iframe for voice/video huddles in team chat.
 *
 * Props:
 *   open       - boolean, whether modal is visible
 *   onClose    - close handler
 *   roomName   - the Jitsi room name (e.g. "wappflow-channel-xyz")
 *   displayName - user's name (auto-fills in Jitsi)
 *   startWithVideo - if true, video starts on; otherwise audio-only ("voice huddle")
 */
export default function HuddleModal({ open, onClose, roomName, displayName, startWithVideo = false }) {
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef(null);

  if (!open) return null;

  const meetUrl = `https://meet.jit.si/${encodeURIComponent(roomName)}`;
  // Use config hash params to control initial state
  // ref: https://github.com/jitsi/handbook/blob/master/docs/dev-guide/dev-guide-iframe.md
  const params = new URLSearchParams({
    'config.prejoinConfig.enabled': 'false',
    'config.startWithAudioMuted': 'false',
    'config.startWithVideoMuted': startWithVideo ? 'false' : 'true',
    'config.disableModeratorIndicator': 'true',
    'config.startScreenSharing': 'false',
    'config.enableEmailInStats': 'false',
    'userInfo.displayName': displayName || 'WappFlow user',
    'interfaceConfig.SHOW_JITSI_WATERMARK': 'false',
    'interfaceConfig.SHOW_WATERMARK_FOR_GUESTS': 'false',
    'interfaceConfig.DEFAULT_BACKGROUND': '#0b0d16',
    'interfaceConfig.DISABLE_VIDEO_BACKGROUND': 'false',
    'interfaceConfig.MOBILE_APP_PROMO': 'false',
  });
  const fullUrl = `${meetUrl}#${params.toString()}`;
  const shareUrl = meetUrl; // plain URL for sharing to teammates

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="hd-overlay" onClick={onClose}>
      <div className="hd-card" onClick={(e) => e.stopPropagation()}>
        <div className="hd-head">
          <div className="hd-title">
            <div className="hd-icon">
              {startWithVideo ? <Video size={16} /> : <Phone size={16} />}
            </div>
            <div>
              <div className="hd-title-text">{startWithVideo ? 'Video huddle' : 'Voice huddle'}</div>
              <div className="hd-title-sub"><Users size={11} /> Live · powered by Jitsi</div>
            </div>
          </div>
          <div className="hd-actions">
            <button className="hd-copy" onClick={copyShareLink} title="Copy join link">
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy invite link</>}
            </button>
            <button className="hd-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="hd-frame-wrap">
          <iframe
            ref={iframeRef}
            src={fullUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
            className="hd-frame"
            title="Huddle"
          />
        </div>
      </div>

      <style>{`
        .hd-overlay {
          position: fixed; inset: 0; z-index: 9998;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          animation: hd-fade 0.15s ease-out;
        }
        @keyframes hd-fade { from { opacity: 0; } to { opacity: 1; } }

        .hd-card {
          width: 100%; height: 100%;
          max-width: 1100px;
          max-height: 700px;
          background: #0b0d16;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 16px;
          overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 40px 100px rgba(0,0,0,0.6);
          animation: hd-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes hd-pop {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .hd-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px;
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          flex-shrink: 0;
        }
        .hd-title { display: flex; align-items: center; gap: 12px; }
        .hd-icon {
          width: 34px; height: 34px;
          border-radius: 9px;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          color: #fff;
          display: grid; place-items: center;
        }
        .hd-title-text {
          font-size: 15px; font-weight: 700;
          color: #f3f4f6;
        }
        .hd-title-sub {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11.5px; color: #9ca3af;
          margin-top: 2px;
        }

        .hd-actions { display: flex; gap: 8px; align-items: center; }
        .hd-copy {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px;
          background: rgba(255,255,255,0.06);
          color: #e7eaf3;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 9px;
          font-size: 12.5px; font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }
        .hd-copy:hover { background: rgba(255,255,255,0.1); }

        .hd-close {
          width: 34px; height: 34px;
          background: rgba(255,255,255,0.06);
          color: #d1d5db;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 9px;
          display: grid; place-items: center;
          cursor: pointer;
        }
        .hd-close:hover { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.3); }

        .hd-frame-wrap { flex: 1; background: #000; position: relative; }
        .hd-frame {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          border: 0;
        }

        @media (max-width: 768px) {
          .hd-overlay { padding: 0; }
          .hd-card { max-height: none; border-radius: 0; }
          .hd-copy { display: none; }
        }
      `}</style>
    </div>
  );
}
