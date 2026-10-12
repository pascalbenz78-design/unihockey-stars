// Speichern im Claude-Konto, wenn das Spiel als claude.ai-Artifact läuft
// (Capability «db», privater Bereich data/users/<id>/ pro Person).
// Ein Dokument darf höchstens 256 KB gross sein: Der Spielstand wird deshalb
// mit gzip gepackt und in Teile aufgeteilt.

const PART = 180000;   // Zeichen pro Teil-Dokument

export const inArtifact = () => !!(window.claude && typeof window.claude.use === 'function');

// Verbindung herstellen; null, wenn nicht verfügbar (nicht angemeldet, keine Schreibrechte …)
export async function connectCloud() {
  if (!inArtifact()) return null;
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return null;
    const uid = await user.id();
    if (!uid) return null;
    return { db, base: `data/users/${uid}` };
  } catch { return null; }
}

async function pack(text) {
  if (typeof CompressionStream === 'undefined') return { enc: 'json', data: text };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { enc: 'gzip64', data: btoa(bin) };
}

async function unpack(enc, data) {
  if (enc === 'json') return data;
  const bin = atob(data);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// Nur die Kopfdaten (wann zuletzt gespeichert)
export async function cloudMeta(cloud) {
  const s = await cloud.db.doc(`${cloud.base}/save`).get();
  return s.exists ? s.data() : null;
}

export async function cloudSave(cloud, bundle) {
  const { enc, data } = await pack(JSON.stringify(bundle));
  const parts = Math.ceil(data.length / PART) || 1;
  for (let i = 0; i < parts; i++) {
    await cloud.db.doc(`${cloud.base}/part${i}`).set({ d: data.slice(i * PART, (i + 1) * PART) });
  }
  // Kopf zuletzt schreiben: Er zeigt erst dann auf die neuen Teile
  await cloud.db.doc(`${cloud.base}/save`).set({ savedAt: bundle.savedAt, parts, enc, v: 1 });
  return bundle.savedAt;
}

export async function cloudLoad(cloud) {
  const meta = await cloudMeta(cloud);
  if (!meta) return null;
  let data = '';
  for (let i = 0; i < meta.parts; i++) {
    const s = await cloud.db.doc(`${cloud.base}/part${i}`).get();
    if (!s.exists) throw new Error('Spielstand unvollständig');
    data += s.data().d;
  }
  return { meta, bundle: JSON.parse(await unpack(meta.enc, data)) };
}
