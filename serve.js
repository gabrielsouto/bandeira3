import http from 'node:http';
import { readFile } from 'node:fs/promises';
const types = {html:'text/html',js:'text/javascript',css:'text/css',png:'image/png'};
const allowed = /^\/(?:index\.html|ajuda\.html|game\.bundle\.js|style\.css|js\/[\w-]+\.js|docs\/imagens\/[\w-]+\.png)$/;
const port = Number(process.env.PORT || 4173);
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/' ? '/index.html' : path;
  if (!allowed.test(file)) {res.writeHead(404).end(); return;}
  try {
    const bytes = await readFile(new URL('.' + file, import.meta.url));
    res.writeHead(200, {'Content-Type': types[file.split('.').pop()], 'Cache-Control':'no-cache'}).end(bytes);
  } catch {res.writeHead(404).end();}
}).listen(port, '127.0.0.1', () => console.log('Bandeira 3 em http://127.0.0.1:' + port));
