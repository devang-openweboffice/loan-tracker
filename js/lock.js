/* App lock: the app shows nothing until the password is entered.
   Only a salted PBKDF2 hash of the password is stored (never the password itself). */

const Lock = (() => {
  const KEY = 'avani_lock_v1';
  const ITER = 150000;
  const AUTO_LOCK_MS = 5 * 60 * 1000;   // lock again after 5 minutes in the background
  let unlocked = false, hiddenAt = 0, onUnlock = null;
  let fails = 0, blockedUntil = 0;

  const stored = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));

  async function hash(password, saltHex, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: iter }, base, 256));
  }
  async function setPassword(pw) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(KEY, JSON.stringify({ salt, iter: ITER, hash: await hash(pw, salt, ITER) }));
  }
  async function check(pw) {
    const s = stored(); if (!s) return false;
    const h = await hash(pw, s.salt, s.iter);
    let diff = 0; for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ s.hash.charCodeAt(i);   // constant-time compare
    return diff === 0 && h.length === s.hash.length;
  }

  /* ---------- lock screen ---------- */
  function show() {
    unlocked = false;
    document.body.classList.add('locked');
    const view = document.getElementById('view'); if (view) view.innerHTML = '';   // nothing readable behind the lock
    let el = document.getElementById('lock');
    if (!el) { el = document.createElement('div'); el.id = 'lock'; document.body.appendChild(el); }
    const creating = !stored();
    el.innerHTML = `<form class="lock-box" autocomplete="off">
      <img src="icons/icon-192.png" alt="" class="lock-icon">
      <h1>Loan Tracker</h1>
      <p>${creating ? 'Create a password to protect the app. You will need it every time the app opens.' : 'Enter your password to open the app.'}</p>
      <input type="password" id="lock-pw" placeholder="${creating ? 'New password (at least 4 characters)' : 'Password'}" autocomplete="${creating ? 'new-password' : 'current-password'}" required>
      ${creating ? '<input type="password" id="lock-pw2" placeholder="Type it again" autocomplete="new-password" required>' : ''}
      <button class="btn primary" id="lock-go">${creating ? 'Set password' : 'Unlock'}</button>
      <div class="lock-msg" id="lock-msg" role="alert"></div>
      ${creating ? '' : '<button type="button" class="link-btn lock-forgot" id="lock-forgot">Forgot password?</button>'}
    </form>`;
    const form = el.querySelector('form'), msg = el.querySelector('#lock-msg'), pw = el.querySelector('#lock-pw');
    setTimeout(() => pw.focus(), 50);
    form.onsubmit = async e => {
      e.preventDefault();
      if (Date.now() < blockedUntil) { msg.textContent = `Too many tries. Wait ${Math.ceil((blockedUntil - Date.now()) / 1000)} seconds.`; return; }
      const go = el.querySelector('#lock-go'); go.disabled = true;
      try {
        if (creating) {
          const pw2 = el.querySelector('#lock-pw2').value;
          if (pw.value.length < 4) { msg.textContent = 'Use at least 4 characters.'; return; }
          if (pw.value !== pw2) { msg.textContent = 'The two passwords do not match.'; return; }
          await setPassword(pw.value);
          open();
        } else if (await check(pw.value)) {
          fails = 0; open();
        } else {
          fails++; pw.value = ''; pw.focus();
          if (fails >= 5) { blockedUntil = Date.now() + 30000; fails = 0; msg.textContent = 'Too many wrong tries. Wait 30 seconds.'; }
          else msg.textContent = 'Wrong password.';
          form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        }
      } finally { go.disabled = false; }
    };
    const fg = el.querySelector('#lock-forgot');
    if (fg) fg.onclick = forgot;
  }

  function open() {
    unlocked = true;
    document.body.classList.remove('locked');
    const el = document.getElementById('lock'); if (el) el.remove();
    if (onUnlock) { const f = onUnlock; onUnlock = null; f(); } else if (window.route) route();
  }

  // No way to recover the password: reset this device. Files come back from the GitHub backup once reconnected.
  async function forgot() {
    const backedUp = window.GH && GH.enabled();
    if (!confirm('Reset the app on this phone?\n\nThis removes the password and all data stored on this phone.' +
      (backedUp ? '\nYour files are backed up on GitHub; Devang can reconnect the backup to bring them back.' : '\nFiles that were not backed up will be lost.'))) return;
    const keep = ['avani_install_dismissed'];
    Object.keys(localStorage).filter(k => k.startsWith('avani_') && !keep.includes(k)).forEach(k => localStorage.removeItem(k));
    try { indexedDB.deleteDatabase('avani_docs'); } catch (e) {}
    show();
  }

  /* Call once at start-up; runs `start` after the first unlock. */
  function gate(start) {
    onUnlock = start;
    show();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (unlocked && hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) show();
    });
  }

  async function change(oldPw, newPw) {
    if (!(await check(oldPw))) throw new Error('The current password is wrong.');
    if (newPw.length < 4) throw new Error('Use at least 4 characters.');
    await setPassword(newPw);
  }

  return { gate, lockNow: show, change, isUnlocked: () => unlocked };
})();
