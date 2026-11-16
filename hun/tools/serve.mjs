// Bağımlılıksız statik sunucu: `npm start` → http://localhost:5173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || process.argv[2] || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(data);
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); }
});

// Port doluysa (ör. başka bir kopya çalışıyorsa) sıradaki boş portu dener.
let current = port;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && current < port + 20) {
    console.log(`Port ${current} kullanımda, ${current + 1} deneniyor…`);
    server.listen(++current);
  } else { console.error('Sunucu başlatılamadı:', err.message); process.exit(1); }
});
server.on('listening', () => console.log(`Hun Vaha Aracı: http://localhost:${current}`));
server.listen(current);
