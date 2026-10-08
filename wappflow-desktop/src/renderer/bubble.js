'use strict';
// Desktop chat bubbles (PROP-007): draw the heads; dragging moves the whole
// window (the main process follows the cursor and snaps it to an edge);
// a click without movement opens that chat; ✕ closes one bubble.
(function () {
  const stack = document.getElementById('stack');
  const cls = { whatsapp: 'wa', instagram: 'ig', facebook: 'fb' };
  let press = null;

  function render({ heads }) {
    stack.textContent = '';
    for (const h of heads || []) {
      const wrap = document.createElement('div'); wrap.className = 'head';
      const face = document.createElement('div');
      face.className = 'face ' + (cls[h.platform] || 'other');
      face.textContent = (String(h.name || '?').trim()[0] || '?').toUpperCase();
      face.title = h.name + (h.unread ? ` — ${h.unread} new` : '') + '\nClick to open · drag to move';
      face.setAttribute('role', 'button');
      face.setAttribute('aria-label', `${h.name}, ${h.unread || 0} unread. Open chat`);
      face.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        face.setPointerCapture(e.pointerId);
        press = { id: h.id, x: e.screenX, y: e.screenY, moved: false };
        window.bubble.dragStart();
      });
      face.addEventListener('pointermove', (e) => {
        if (!press) return;
        if (!press.moved && Math.hypot(e.screenX - press.x, e.screenY - press.y) < 4) return;
        press.moved = true;
        window.bubble.dragMove();
      });
      const end = () => {
        if (!press) return;
        const p = press; press = null;
        window.bubble.dragEnd();
        if (!p.moved) window.bubble.open(p.id);
      };
      face.addEventListener('pointerup', end);
      face.addEventListener('pointercancel', end);
      wrap.appendChild(face);
      if (h.unread > 0) {
        const b = document.createElement('span'); b.className = 'badge';
        b.textContent = h.unread > 9 ? '9+' : String(h.unread);
        wrap.appendChild(b);
      }
      const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕';
      x.setAttribute('aria-label', `Close ${h.name}'s bubble`);
      x.addEventListener('click', () => window.bubble.close(h.id));
      wrap.appendChild(x);
      stack.appendChild(wrap);
    }
  }
  window.bubble.onState(render);
  // Right-click anywhere closes them all.
  window.addEventListener('contextmenu', (e) => { e.preventDefault(); window.bubble.close(null); });
})();
