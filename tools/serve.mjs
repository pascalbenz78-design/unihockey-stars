// Kleiner Webserver zum lokalen Testen (Module brauchen http://, file:// reicht nicht).
//   node tools/serve.mjs [Port]      → http://localhost:8080
// Im WLAN erreichbar über die IP-Adresse des PCs, z. B. http://192.168.1.20:8080

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = +process.argv[2] || 8080;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".md": "text/plain; charset=utf-8" };

http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(root, path.endsWith("/") ? path + "index.html" : path));
  if (!file.startsWith(normalize(root))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch { res.writeHead(404).end("Nicht gefunden"); }
}).listen(port, "0.0.0.0", () => console.log(`Unihockey Stars läuft auf http://localhost:${port}`));
