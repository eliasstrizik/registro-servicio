import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
createServer((request, response) => {
  const requested = normalize(decodeURIComponent(request.url?.split('?')[0] || '/')).replace(/^(\.\.[\\/])+/, '');
  let file = join(root, requested === '/' ? 'index.html' : requested);
  if (!existsSync(file)) file = join(root, 'index.html');
  response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  createReadStream(file).pipe(response);
}).listen(4173, () => console.log('Local: http://localhost:4173'));

