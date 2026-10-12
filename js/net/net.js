// Verbindung zu zweit (gleiches Muster wie beim Spiel «Netzroller»). Zwei Wege mit denselben Aufrufen
// (presence / onPeers / leave):
//   - auf claude.ai: der Live-Raum der Plattform (claude.use("room")); er verbindet sich selbst neu
//   - überall sonst (GitHub Pages): direkte WebRTC-Verbindung über PeerJS
// Jedes Gerät veröffentlicht ein «Präsenz»-Objekt; das andere liest es. Alles ist absoluter Zustand.
//
// Wiederverbinden (PeerJS): Hört der Gast länger als STALE_MS nichts mehr, baut er die Verbindung neu
// auf. Der Gastgeber nimmt eine neue Verbindung jederzeit an und ersetzt die alte.

const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
const STALE_MS = 3500, RETRY_MS = 3000, HOST_ID_RETRIES = 6;
const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** Für Tests: bis zu diesem Zeitpunkt (performance.now) gehen keine Daten hin und her, wie bei WLAN aus. */
export const netTest = { dropUntil: 0 };
const dropping = () => performance.now() < netTest.dropUntil;

// Code zum Beitreten: 4 Zeichen ohne Verwechslungsgefahr (kein 0/o, 1/l/i)
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export const makeCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const cleanCode = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4);

/** Liefert { room, p2p } oder room = null, wenn zu zweit nicht möglich ist. */
export async function connectRoomProvider() {
  const inClaude = !!(window.claude && window.claude.use);
  if (inClaude) {
    try { return { room: await window.claude.use('room'), p2p: false }; } catch (e) { return { room: null, p2p: false }; }
  }
  return { room: makeP2P(), p2p: true };
}

function loadPeerJs() {
  return new Promise((res, rej) => {
    if (window.Peer) return res();
    const sc = document.createElement('script');
    sc.src = PEERJS_URL;
    sc.onload = () => res(); sc.onerror = () => rej(new Error('Die Verbindungs-Bibliothek liess sich nicht laden (Internet?).'));
    document.head.appendChild(sc);
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

function makeP2P() {
  return {
    async join(name, asHost) {
      await loadPeerJs();
      const hostId = 'unihockey-stars-v1-' + name;
      let mine = {}, theirs = null, theirId = null, conn = null, closed = false, sendT = 0, retryT = 0;
      let myId = '', failJoin = null, lastData = performance.now(), lastAttempt = 0;
      const listeners = new Set();
      const snapshot = () => {
        const list = [{ peer: myId, sameTab: true, isMe: true, presence: mine }];
        if (theirs && conn && conn.open) list.push({ peer: theirId, sameTab: false, isMe: false, presence: theirs });
        return list;
      };
      // wie beim Raum von claude.ai: Änderungen gebündelt und nie mitten in einem Aufruf melden
      let emitT = 0;
      const emitPeers = () => {
        if (emitT) return;
        emitT = setTimeout(() => { emitT = 0; const peers = snapshot(); listeners.forEach(fn => { try { fn({ peers }); } catch (e) { console.error(e); } }); }, 0);
      };
      const flush = () => { sendT = 0; if (conn && conn.open && !dropping()) { try { conn.send(mine); } catch (e) { /* nächstes Mal */ } } };
      const attach = c => {
        const old = conn;
        conn = c;
        if (old && old !== c) { try { old.close(); } catch (e) { /* egal */ } }
        c.on('open', () => { if (conn !== c) return; theirId = c.peer; lastData = performance.now(); flush(); });
        c.on('data', d => {
          if (conn !== c || dropping()) return;
          if (d && typeof d === 'object' && !Array.isArray(d)) { lastData = performance.now(); theirs = Object.freeze({ ...d }); emitPeers(); }
        });
        c.on('close', () => { if (conn === c) { conn = null; theirs = null; emitPeers(); if (!asHost && !closed) retry(); } });
        c.on('error', () => {});
      };
      const opts = { debug: 0, config: { iceServers: STUN } };

      // Gastgeber: Nach einem Neuladen ist die alte Kennung beim Vermittlungsserver manchmal
      // noch ein paar Sekunden belegt. Dann mehrmals nachfragen.
      const open = () => new Promise((res, rej) => {
        const pr = asHost ? new window.Peer(hostId, opts) : new window.Peer(opts);
        const t = setTimeout(() => { pr.destroy(); rej(new Error('Der Vermittlungsserver antwortet nicht.')); }, 12000);
        pr.on('open', id => { clearTimeout(t); myId = id; res(pr); });
        pr.on('error', e => {
          clearTimeout(t);
          if (e.type === 'unavailable-id') { pr.destroy(); rej(Object.assign(new Error('Dieser Code ist gerade besetzt.'), { taken: true })); }
          else if (e.type === 'peer-unavailable') { if (!asHost && !theirs && failJoin) failJoin(new Error('Kein Spiel mit diesem Code gefunden.')); }
          else if (e.type === 'network' || e.type === 'disconnected' || e.type === 'socket-error' || e.type === 'server-error') { /* wird unten neu verbunden */ }
          else rej(new Error(`Verbindung fehlgeschlagen (${e.type}).`));
        });
      });
      let peer = null;
      for (let i = 0; ; i++) {
        try { peer = await open(); break; } catch (e) { if (!e.taken || i >= HOST_ID_RETRIES) throw e; await wait(2500); }
      }

      const reconnectBroker = () => { if (peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* später */ } } };
      const connectToHost = () => { lastAttempt = performance.now(); reconnectBroker(); try { attach(peer.connect(hostId, { reliable: true })); } catch (e) { /* später */ } };
      const retry = () => { clearTimeout(retryT); retryT = setTimeout(() => { if (!closed && !conn) connectToHost(); }, 1500); };

      if (asHost) {
        peer.on('connection', c => attach(c));   // ein neuer Versuch des Gasts ersetzt die alte Verbindung
      } else {
        await new Promise((res, rej) => {
          failJoin = e => { peer.destroy(); rej(e); };
          const c = peer.connect(hostId, { reliable: true });
          const t = setTimeout(() => failJoin && failJoin(new Error('Der Gastgeber antwortet nicht.')), 12000);
          c.on('open', () => { clearTimeout(t); failJoin = null; res(); });
          attach(c);
        });
      }
      peer.on('disconnected', () => { if (!closed) setTimeout(reconnectBroker, 1000); });

      // Wächter: hört der Gast zu lange nichts, verbindet er sich neu
      const watch = setInterval(() => {
        if (closed) return;
        reconnectBroker();
        const now = performance.now();
        if (!asHost && now - lastData > STALE_MS && now - lastAttempt > RETRY_MS && !dropping()) {
          if (conn) { const c = conn; conn = null; theirs = null; try { c.close(); } catch (e) { /* egal */ } emitPeers(); }
          connectToHost();
        }
      }, 1000);

      return {
        presence(patch) {
          mine = { ...mine };
          for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
          if (!sendT) sendT = setTimeout(flush, 30);
          emitPeers();
          return Promise.resolve();
        },
        onPeers(fn) { listeners.add(fn); setTimeout(() => fn({ peers: snapshot() }), 0); return () => listeners.delete(fn); },
        async leave() {
          closed = true; clearTimeout(retryT); clearInterval(watch); listeners.clear();
          try { if (conn) conn.close(); } catch (e) { /* egal */ }
          try { peer.destroy(); } catch (e) { /* egal */ }
        },
      };
    },
  };
}

// ------------------------------------------------------------ Text packen (Teamdaten)

const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export async function packText(text) {
  if (typeof CompressionStream === 'undefined') return 'j' + toB64(new TextEncoder().encode(text));
  const buf = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return 'z' + toB64(new Uint8Array(buf));
}

export async function unpackText(s) {
  const bytes = fromB64(s.slice(1));
  if (s[0] === 'j') return new TextDecoder().decode(bytes);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
