/* Cloud storage in a PRIVATE GitHub repo via the GitHub REST API (contents endpoint).
   Layout of the data repo:
     images/<appId>_<fileId>_<n>.jpg   every uploaded document photo, all in one folder
     data/files.json                    all files + deletions, merged per file by updatedAt
     data/settings.json                 targets, stages, notes (never the API key or token) */

const GH = (() => {
  const API = 'https://api.github.com';
  const cfg = () => ({ owner: APP_CONFIG.githubOwner, repo: APP_CONFIG.githubRepo, branch: APP_CONFIG.githubBranch || 'main', token: Store.settings().ghToken });
  const enabled = () => { const c = cfg(); return !!(c.owner && c.repo && c.token); };

  async function api(path, opts = {}) {
    const c = cfg();
    const res = await fetch(`${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}${path}`, Object.assign({}, opts, {
      headers: Object.assign({ Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {})
    }));
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) {
      let msg = `GitHub error ${res.status}`;
      try { msg += ': ' + (await res.json()).message; } catch (e) {}
      if (res.status === 401) msg = 'GitHub rejected the token. Check it in Settings.';
      if (res.status === 404) msg = 'GitHub repo not found, or the token has no access to it.';
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res;
  }

  const b64 = str => btoa(unescape(encodeURIComponent(str)));
  const unb64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));

  async function getJson(path) {
    const res = await api(`/contents/${path}?ref=${cfg().branch}`, { allow404: true });
    if (!res) return { data: null, sha: null };
    const j = await res.json();
    return { data: JSON.parse(unb64(j.content)), sha: j.sha };
  }
  async function put(path, base64, message, sha) {
    const body = { message, content: base64, branch: cfg().branch };
    if (sha) body.sha = sha;
    return (await api(`/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) })).json();
  }

  /* ---------- connection check (Settings) ---------- */
  async function test() {
    const c = cfg();
    const res = await fetch(`${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, { headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json' } });
    if (res.status === 401) throw new Error('GitHub rejected the token. It may be incomplete, expired or deleted. Copy it again, or create a new one.');
    if (!res.ok) {
      // Work out why: whose token is this, and is it a classic token without the "repo" scope?
      let who = '';
      try {
        const u = await fetch(`${API}/user`, { headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json' } });
        if (u.ok) who = (await u.json()).login;
      } catch (e) {}
      const repo = `${c.owner}/${c.repo}`;
      if (who && who.toLowerCase() !== String(c.owner).toLowerCase())
        throw new Error(`This token belongs to @${who}, but the backup repo is ${repo}. Create the token while signed in as ${c.owner}.`);
      if (/^ghp_/.test(c.token))
        throw new Error(`This is a classic token and it can't see ${repo}. On GitHub, edit it and tick the "repo" scope, or create a fine-grained token instead.`);
      throw new Error(`The token works${who ? ' for @' + who : ''}, but it has no access to ${repo}. On GitHub → Settings → Developer settings → Fine-grained tokens, edit the token: Repository access → "Only select repositories" → ${c.repo}, and Contents → "Read and write". Click Update, then Save & connect again.`);
    }
    const r = await res.json();
    if (!r.private) throw new Error(`"${r.full_name}" is PUBLIC. Customer documents must go to a PRIVATE repo. Change it to private on GitHub first.`);
    if (r.permissions && !r.permissions.push) throw new Error('The token can read but not write. Give it "Contents: Read and write".');
    return r.full_name;
  }

  /* ---------- photos ---------- */
  const photoPath = (file, i) => `images/${String(file.appId || 'noid').replace(/[^\w-]/g, '')}_${file.id}_${i + 1}.jpg`;

  // Upload photos not yet in the repo; returns the list of repo paths.
  async function uploadPhotos(file, photos) {
    const paths = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (p.remote) { paths.push(p.remote); continue; }
      const path = photoPath(file, i);
      const existing = await api(`/contents/${path}?ref=${cfg().branch}`, { allow404: true });
      const sha = existing ? (await existing.json()).sha : undefined;
      await put(path, p.dataUrl.split(',')[1], `Photo ${i + 1} of ${file.applicantName || file.appId || file.id}`, sha);
      p.remote = path; paths.push(path);
    }
    return paths;
  }

  async function downloadPhoto(path) {
    const res = await api(`/contents/${path}?ref=${cfg().branch}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    const blob = await res.blob();
    return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.replace(/^data:[^;]*;/, 'data:image/jpeg;')); fr.readAsDataURL(blob); });
  }

  async function deletePhotos(paths) {
    for (const path of paths || []) {
      try {
        const res = await api(`/contents/${path}?ref=${cfg().branch}`, { allow404: true });
        if (!res) continue;
        const { sha } = await res.json();
        await api(`/contents/${path}`, { method: 'DELETE', body: JSON.stringify({ message: 'Remove photo of deleted file', sha, branch: cfg().branch }) });
      } catch (e) { /* best effort */ }
    }
  }

  /* ---------- data sync ---------- */
  const TOMB_KEY = 'avani_deleted_v1';
  const tombs = () => { try { return JSON.parse(localStorage.getItem(TOMB_KEY)) || {}; } catch (e) { return {}; } };
  function markDeleted(id) { const t = tombs(); t[id] = new Date().toISOString(); localStorage.setItem(TOMB_KEY, JSON.stringify(t)); }

  // Two people (Avani + Devang) can edit the same file on different phones.
  // Details: newest edit wins. Stage history and queries: kept from both sides, so nothing logged is lost.
  function mergeFile(x, y) {
    const [older, newer] = (x.updatedAt || '') > (y.updatedAt || '') ? [y, x] : [x, y];
    const out = Object.assign({}, newer);
    const hist = new Map();
    [...(older.history || []), ...(newer.history || [])].forEach(h => hist.set(h.stage + '|' + h.at, h));
    out.history = [...hist.values()];
    const qs = new Map();
    [...(older.queries || []), ...(newer.queries || [])].forEach(q => {
      const cur = qs.get(q.id);
      // keep the resolved version if either phone resolved it
      if (!cur || (!cur.resolvedAt && q.resolvedAt) || (!!cur.resolvedAt === !!q.resolvedAt)) qs.set(q.id, q);
    });
    out.queries = [...qs.values()];
    out.photoPaths = [...new Set([...(older.photoPaths || []), ...(newer.photoPaths || [])])];
    return out;
  }

  // A deletion wins over any edit made before it.
  function merge(a, b) {
    const deleted = Object.assign({}, a.deleted, b.deleted);
    Object.keys(b.deleted || {}).forEach(k => { if (a.deleted && a.deleted[k] > deleted[k]) deleted[k] = a.deleted[k]; });
    const byId = new Map();
    [...(a.files || []), ...(b.files || [])].forEach(f => {
      const cur = byId.get(f.id);
      if (!cur) byId.set(f.id, f);
      else if (JSON.stringify(cur) !== JSON.stringify(f)) byId.set(f.id, mergeFile(cur, f));
    });
    const files = [...byId.values()].filter(f => !deleted[f.id] || (f.updatedAt || '') > deleted[f.id]);
    return { files, deleted };
  }

  let syncing = null, again = false;
  function sync() {
    if (!enabled()) return Promise.resolve(false);
    if (syncing) { again = true; return syncing; }
    setStatus('syncing');
    syncing = (async () => {
      try {
        const before = JSON.stringify(Store.files());
        for (let attempt = 0; attempt < 3; attempt++) {
          const remote = await getJson('data/files.json');
          const local = { files: Store.files(), deleted: tombs() };
          const merged = merge(local, remote.data || { files: [], deleted: {} });
          Store.saveFiles(merged.files);
          localStorage.setItem(TOMB_KEY, JSON.stringify(merged.deleted));
          const payload = JSON.stringify({ updatedAt: new Date().toISOString(), files: merged.files, deleted: merged.deleted }, null, 1);
          const remoteSame = remote.data && JSON.stringify({ f: remote.data.files, d: remote.data.deleted }) === JSON.stringify({ f: merged.files, d: merged.deleted });
          if (remoteSame) break;
          try { await put('data/files.json', b64(payload), `Sync ${merged.files.length} files`, remote.sha); break; }
          catch (e) { if (e.status !== 409 && e.status !== 422) throw e; }   // someone else saved in between → merge again
        }
        await syncSettings();
        localStorage.setItem('avani_last_sync', new Date().toISOString());
        setStatus('ok');
        return JSON.stringify(Store.files()) !== before;   // true when this device received changes
      } catch (e) { setStatus('error', e.message); throw e; }
      finally {
        syncing = null;
        if (again) { again = false; sync().catch(() => {}); }
      }
    })();
    return syncing;
  }

  // Settings: targets/notes/stages are shared; the key and token stay on each device.
  async function syncSettings() {
    const remote = await getJson('data/settings.json');
    const local = Store.settings();
    const lt = localStorage.getItem('avani_settings_changed') || '';
    if (remote.data && (remote.data.changedAt || '') > lt) {
      Store.saveSettings(Object.assign({}, remote.data.settings, { apiKey: local.apiKey, ghToken: local.ghToken }));
      localStorage.setItem('avani_settings_changed', remote.data.changedAt);
    } else if (!remote.data || (remote.data.changedAt || '') < lt) {
      const shared = Object.assign({}, local, { apiKey: '', ghToken: '' });
      await put('data/settings.json', b64(JSON.stringify({ changedAt: lt || new Date().toISOString(), settings: shared }, null, 1)), 'Sync settings', remote.sha);
    }
  }

  let timer;
  const syncSoon = () => { if (!enabled()) return; clearTimeout(timer); timer = setTimeout(() => sync().catch(() => {}), 1500); };

  function setStatus(state, msg) {
    const el = document.getElementById('sync-dot'); if (!el) return;
    el.dataset.state = state;
    el.title = state === 'syncing' ? 'Syncing with GitHub…' : state === 'error' ? 'Sync failed: ' + msg : 'Synced with GitHub';
  }

  return { enabled, test, sync, syncSoon, uploadPhotos, downloadPhoto, deletePhotos, markDeleted, merge };
})();
