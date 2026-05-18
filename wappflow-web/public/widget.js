(function () {
  'use strict';

  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var formToken = script.getAttribute('data-form') || '';
  var title = script.getAttribute('data-title') || 'Contact Us';
  var primaryColor = script.getAttribute('data-color') || '#6366f1';
  var apiBase = script.getAttribute('data-api') || script.src.replace(/\/widget\.js.*$/, '');

  if (!formToken) { console.warn('[WappFlow] widget.js: data-form attribute missing'); return; }

  var styles = `
    #wf-widget-btn {
      position: fixed; bottom: 28px; right: 28px; z-index: 99999;
      width: 56px; height: 56px; border-radius: 50%;
      background: ${primaryColor}; border: none; cursor: pointer;
      box-shadow: 0 6px 24px rgba(0,0,0,0.22);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #wf-widget-btn:hover { transform: scale(1.08); box-shadow: 0 10px 32px rgba(0,0,0,0.28); }
    #wf-widget-panel {
      position: fixed; bottom: 96px; right: 28px; z-index: 99999;
      width: 360px; max-width: calc(100vw - 40px);
      background: #ffffff; border-radius: 20px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.18);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      transform-origin: bottom right;
      animation: wfSlideUp 0.22s ease;
    }
    @keyframes wfSlideUp { from { opacity:0; transform:scale(0.92) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
    #wf-widget-panel.wf-hidden { display: none; }
    .wf-header {
      background: ${primaryColor}; padding: 20px 22px; color: white;
    }
    .wf-header h3 { margin: 0 0 4px; font-size: 16px; font-weight: 800; }
    .wf-header p { margin: 0; font-size: 13px; opacity: 0.85; }
    .wf-body { padding: 20px 22px; }
    .wf-field { margin-bottom: 14px; }
    .wf-field label { display: block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.4px; }
    .wf-field input, .wf-field textarea {
      width: 100%; padding: 10px 13px; border: 1.5px solid #e5e7eb;
      border-radius: 10px; font-size: 14px; outline: none; box-sizing: border-box;
      font-family: inherit; color: #111827; background: #f9fafb;
      transition: border-color 0.15s;
    }
    .wf-field input:focus, .wf-field textarea:focus { border-color: ${primaryColor}; background: #fff; }
    .wf-field textarea { resize: vertical; min-height: 72px; }
    .wf-submit {
      width: 100%; padding: 12px; background: ${primaryColor}; color: white;
      border: none; border-radius: 12px; font-size: 14px; font-weight: 700;
      cursor: pointer; transition: opacity 0.2s;
    }
    .wf-submit:hover { opacity: 0.88; }
    .wf-submit:disabled { opacity: 0.55; cursor: not-allowed; }
    .wf-success { text-align: center; padding: 32px 20px; }
    .wf-success svg { display: block; margin: 0 auto 12px; }
    .wf-success h4 { margin: 0 0 6px; font-size: 16px; color: #111827; }
    .wf-success p { margin: 0; font-size: 13px; color: #6b7280; }
    .wf-close-btn {
      position: absolute; top: 14px; right: 14px; background: rgba(255,255,255,0.2);
      border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;
    }
  `;

  var styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  var btn = document.createElement('button');
  btn.id = 'wf-widget-btn';
  btn.setAttribute('aria-label', 'Open contact form');
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';

  var panel = document.createElement('div');
  panel.id = 'wf-widget-panel';
  panel.className = 'wf-hidden';
  panel.innerHTML = `
    <div class="wf-header" style="position:relative">
      <button class="wf-close-btn" id="wf-close" aria-label="Close">&times;</button>
      <h3>${title}</h3>
      <p>We'll get back to you shortly</p>
    </div>
    <div class="wf-body" id="wf-form-body">
      <div class="wf-field">
        <label>Your Name</label>
        <input type="text" id="wf-name" placeholder="John Smith" autocomplete="name" />
      </div>
      <div class="wf-field">
        <label>Phone Number</label>
        <input type="tel" id="wf-phone" placeholder="+1 234 567 8900" autocomplete="tel" />
      </div>
      <div class="wf-field">
        <label>Email</label>
        <input type="email" id="wf-email" placeholder="you@example.com" autocomplete="email" />
      </div>
      <div class="wf-field">
        <label>Message</label>
        <textarea id="wf-message" placeholder="How can we help?"></textarea>
      </div>
      <button class="wf-submit" id="wf-submit">Send Message</button>
      <p id="wf-error" style="color:#ef4444;font-size:12px;margin-top:8px;display:none"></p>
    </div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var open = false;

  function toggle() {
    open = !open;
    panel.className = open ? '' : 'wf-hidden';
    btn.innerHTML = open
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
  }

  btn.addEventListener('click', toggle);
  document.getElementById('wf-close').addEventListener('click', toggle);

  document.getElementById('wf-submit').addEventListener('click', function () {
    var name = (document.getElementById('wf-name').value || '').trim();
    var phone = (document.getElementById('wf-phone').value || '').trim();
    var email = (document.getElementById('wf-email').value || '').trim();
    var message = (document.getElementById('wf-message').value || '').trim();
    var errorEl = document.getElementById('wf-error');

    if (!name && !phone && !email) {
      errorEl.textContent = 'Please fill in at least your name, phone, or email.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

    var submitBtn = document.getElementById('wf-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    fetch(apiBase + '/api/website-form/' + formToken + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, phone: phone, email: email, message: message }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          document.getElementById('wf-form-body').innerHTML = `
            <div class="wf-success">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <h4>Message sent!</h4>
              <p>We've received your message and will get back to you soon.</p>
            </div>`;
        } else {
          errorEl.textContent = data.error || 'Something went wrong. Please try again.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Message';
        }
      })
      .catch(function () {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Message';
      });
  });
})();
