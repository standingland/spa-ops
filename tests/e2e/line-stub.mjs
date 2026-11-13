// A tiny stand-in for LINE, used only by the browser tests (LINE_API_BASE and LINE_AUTH_BASE point here).
// authorize: remembers the nonce and sends the browser straight back to the app with a code.
// token and verify: answer like LINE would for that code. push: records the message; GET /__pushed lists them.
import http from 'node:http';

const PORT = Number(process.env.LINE_STUB_PORT ?? 3199);
const nonces = new Map();
const pushed = [];

const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b)); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/oauth2/v2.1/authorize') {
    const code = `code-${Date.now()}`;
    nonces.set(code, url.searchParams.get('nonce'));
    const back = new URL(url.searchParams.get('redirect_uri'));
    back.searchParams.set('code', code);
    back.searchParams.set('state', url.searchParams.get('state'));
    res.writeHead(302, { location: back.toString() }); res.end(); return;
  }
  if (req.method === 'POST' && url.pathname === '/oauth2/v2.1/token') {
    const code = new URLSearchParams(await readBody(req)).get('code');
    return send(res, 200, { id_token: `idt:${code}` });
  }
  if (req.method === 'POST' && url.pathname === '/oauth2/v2.1/verify') {
    const idt = new URLSearchParams(await readBody(req)).get('id_token') ?? '';
    return send(res, 200, { sub: 'U-e2e-guest', name: 'E2E Guest', nonce: nonces.get(idt.replace('idt:', '')) });
  }
  if (req.method === 'POST' && url.pathname === '/v2/bot/message/push') {
    pushed.push(JSON.parse(await readBody(req)));
    return send(res, 200, {});
  }
  if (req.method === 'GET' && url.pathname === '/__pushed') return send(res, 200, pushed);
  send(res, 404, {});
}).listen(PORT, () => console.log(`line stub on ${PORT}`));
