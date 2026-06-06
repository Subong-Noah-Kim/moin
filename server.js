import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 5173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function resolvePath(urlPath) {
  const pathname = new URL(urlPath || '/', 'http://localhost').pathname;
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(__dirname, safePath);
  if (!full.startsWith(__dirname)) {
    return null;
  }
  return full;
}

const server = http.createServer((req, res) => {
  const target = resolvePath(req.url || '/');

  if (!target) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  try {
    const stats = statSync(target);
    if (!stats.isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const ext = path.extname(target);
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    createReadStream(target).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(port, () => {
  console.log(`moin running at http://localhost:${port}`);
});
