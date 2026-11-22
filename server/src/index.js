// Porta de entrada: manda cada WebSocket para o Durable Object da sala pelo código.
// GET /saude       -> "ok" (para ver se o servidor está no ar)
// GET /sala/K7QF   -> WebSocket da sala K7QF
export { Sala } from './sala.js';

// Páginas que podem abrir salas. Sem cabeçalho Origin (scripts de teste) também passa:
// isso não é segurança, só evita que outro site use o servidor.
const ORIGENS = [/^https:\/\/gabrielsouto\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/saude') return new Response('ok', { headers: { 'access-control-allow-origin': '*' } });

    const m = url.pathname.match(/^\/sala\/([A-Za-z0-9]{4})$/);
    if (!m) return new Response('não encontrado', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('esperava um WebSocket', { status: 426 });
    const origem = req.headers.get('Origin');
    if (origem && !ORIGENS.some((r) => r.test(origem))) return new Response('origem não permitida', { status: 403 });

    const codigo = m[1].toUpperCase();
    // 'sam' = América do Sul: a sala tenta nascer perto dos jogadores no Brasil.
    const sala = env.SALAS.get(env.SALAS.idFromName(codigo), { locationHint: 'sam' });
    return sala.fetch(req);
  },
};
