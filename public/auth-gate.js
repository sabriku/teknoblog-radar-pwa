(() => {
  function injectStyles() {
    if (document.getElementById('tb-auth-gate-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-auth-gate-style';
    style.textContent = `
      body.tb-auth-locked { overflow: hidden; }
      #tb-auth-gate {
        position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center;
        background: linear-gradient(180deg, rgba(248,250,252,.98), rgba(241,245,249,.98));
        font-family: 'Open Sans', sans-serif;
      }
      #tb-auth-gate-card {
        width: min(420px, calc(100vw - 32px)); background: #fff; border: 1px solid #e2e8f0; border-radius: 20px;
        box-shadow: 0 20px 50px rgba(15, 23, 42, .12); padding: 24px;
      }
      #tb-auth-gate-title { font: 700 32px/1 'Fira Sans Condensed', sans-serif; color: #f04a0a; margin: 0 0 12px; }
      #tb-auth-gate-text { margin: 0 0 16px; color: #475569; font-size: 14px; line-height: 1.55; }
      #tb-auth-password { width: 100%; box-sizing: border-box; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 15px; }
      #tb-auth-submit, #tb-auth-logout { width: 100%; margin-top: 12px; padding: 12px 14px; border-radius: 12px; border: 0; font-weight: 700; cursor: pointer; }
      #tb-auth-submit { background: #f04a0a; color: #fff; }
      #tb-auth-logout { background: #fff; color: #f04a0a; border: 1px solid #f04a0a; }
      #tb-auth-message { margin-top: 12px; min-height: 20px; font-size: 13px; color: #b91c1c; }
      #tb-auth-topbar-logout {
        position: fixed; top: 14px; right: 14px; z-index: 9999; padding: 10px 12px; border-radius: 12px;
        border: 1px solid #f04a0a; background: #fff; color: #f04a0a; font-weight: 700; cursor: pointer;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .08);
      }
    `;
    document.head.appendChild(style);
  }

  function showGate() {
    document.body.classList.add('tb-auth-locked');
    if (document.getElementById('tb-auth-gate')) return;
    const gate = document.createElement('div');
    gate.id = 'tb-auth-gate';
    gate.innerHTML = `
      <div id="tb-auth-gate-card">
        <h1 id="tb-auth-gate-title">Teknoblog İçerik Radar</h1>
        <p id="tb-auth-gate-text">Bu sayfaya erişmek için parola girilmesi gerekiyor.</p>
        <input id="tb-auth-password" type="password" placeholder="Parola" autocomplete="current-password" />
        <button id="tb-auth-submit" type="button">Giriş Yap</button>
        <div id="tb-auth-message"></div>
      </div>
    `;
    document.body.appendChild(gate);
    const input = document.getElementById('tb-auth-password');
    if (input) input.focus();
  }

  function hideGate() {
    document.body.classList.remove('tb-auth-locked');
    document.getElementById('tb-auth-gate')?.remove();
    if (!document.getElementById('tb-auth-topbar-logout')) {
      const btn = document.createElement('button');
      btn.id = 'tb-auth-topbar-logout';
      btn.type = 'button';
      btn.textContent = 'Çıkış';
      btn.addEventListener('click', async () => {
        await fetch('/api/exit', { method: 'POST' }).catch(() => null);
        location.reload();
      });
      document.body.appendChild(btn);
    }
  }

  async function checkStatus() {
    const res = await fetch('/api/lock-status', { cache: 'no-store', credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    return Boolean(data?.unlocked);
  }

  async function submitPassword() {
    const input = document.getElementById('tb-auth-password');
    const msg = document.getElementById('tb-auth-message');
    const btn = document.getElementById('tb-auth-submit');
    const password = String(input?.value || '');
    if (!password) {
      if (msg) msg.textContent = 'Parola gerekli.';
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Kontrol ediliyor...'; }
    if (msg) msg.textContent = '';
    try {
      const res = await fetch('/api/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        credentials: 'same-origin',
        body: JSON.stringify({ password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Giriş başarısız');
      location.reload();
    } catch (error) {
      if (msg) msg.textContent = String(error.message || error);
      if (btn) { btn.disabled = false; btn.textContent = 'Giriş Yap'; }
    }
  }

  async function boot() {
    injectStyles();
    document.body.style.visibility = 'hidden';
    let unlocked = false;
    try {
      unlocked = await checkStatus();
    } catch {
      unlocked = false;
    }
    document.body.style.visibility = '';
    if (unlocked) {
      hideGate();
      return;
    }
    showGate();
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('#tb-auth-submit');
      if (!btn) return;
      submitPassword();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && document.getElementById('tb-auth-gate')) submitPassword();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
