/* Photos: resizing for reading/storage, and local storage of each file's document photos (IndexedDB).
   Reading the photos is done by the free on-device reader in ocr.js. */

const Extract = (() => {
  // Downscale to ≤1568px long edge and re-encode as JPEG: sharp enough to read, small enough to store and sync.
  async function prepare(file, maxEdge = 1568, quality = 0.85) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return { name: file.name, dataUrl: c.toDataURL('image/jpeg', quality) };
  }

  /* ---------- photo storage (IndexedDB — photos are too big for localStorage) ---------- */
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('avani_docs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('photos', mode); const req = fn(t.objectStore('photos'));
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
    });
  }
  const photos = {
    get: id => tx('readonly', s => s.get(id)).then(v => v || []).catch(() => []),
    set: (id, list) => tx('readwrite', s => s.put(list, id)),
    remove: id => tx('readwrite', s => s.delete(id)).catch(() => {})
  };

  return { prepare, photos };
})();
