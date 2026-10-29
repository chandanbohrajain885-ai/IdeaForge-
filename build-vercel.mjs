/**
 * Generates Vercel's Build Output (API v3) from this flat project.
 *
 * Why: Vercel normally requires serverless functions inside an "api/" folder.
 * This project is intentionally flat (no sub-folders), so this script runs after
 * "vite build" and creates the folders Vercel needs at BUILD TIME, on Vercel's servers:
 *
 *   .vercel/output/config.json                      routing + headers
 *   .vercel/output/static/                          the built website (from dist/)
 *   .vercel/output/functions/api/<name>.func/       one Node.js function per api-*.ts file
 *
 * Nothing here needs to be committed; it is regenerated on every build.
 */
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, '.vercel', 'output');
const NODE_RUNTIME = 'nodejs22.x';
const MAX_DURATION = 60; // seconds; AI plan generation can take 20-60 s

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[build-vercel] dist/index.html not found. Run "vite build" first.');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'static'), { recursive: true });

// 1. Static website
cpSync(DIST, join(OUT, 'static'), { recursive: true });

// 2. Serverless functions: api-<name>.ts  ->  /api/<name>
const apiFiles = readdirSync(ROOT).filter((f) => /^api-[a-z0-9-]+\.ts$/.test(f));
if (!apiFiles.length) {
  console.error('[build-vercel] No api-*.ts files found.');
  process.exit(1);
}

// Adapter: turns Node's (req, res) into the small interface the handlers use.
const adapter = (file) => `
const mod = require('./${file}');
const handler = mod.default || mod;
const MAX_BYTES = 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) return { tooLarge: true, raw: '' };
    chunks.push(chunk);
  }
  return { tooLarge: false, raw: Buffer.concat(chunks).toString('utf8') };
}

async function vercelFunction(req, res) {
  const send = (code, obj) => {
    if (res.headersSent) return;
    res.statusCode = code;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };
  try {
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const { tooLarge, raw } = await readBody(req);
      if (tooLarge) return send(413, { error: 'Request is too large.' });
      body = raw;
      if (raw) {
        try { body = JSON.parse(raw); } catch { body = raw; }
      } else {
        body = undefined;
      }
    }
    const api = {
      status(code) { res.statusCode = code; return api; },
      json(obj) { send(res.statusCode || 200, obj); },
      setHeader(name, value) { if (!res.headersSent) res.setHeader(name, value); },
    };
    await handler({ method: req.method, body, headers: req.headers }, api);
    if (!res.writableEnded) send(500, { error: 'The server did not send a response.' });
  } catch (err) {
    console.error('[function] unhandled error', err);
    send(500, { error: 'Unexpected server error. Please try again.' });
  }
}

module.exports = vercelFunction;
module.exports.default = vercelFunction;
`;

for (const file of apiFiles) {
  const name = file.replace(/^api-/, '').replace(/\.ts$/, '');
  const dir = join(OUT, 'functions', 'api', `${name}.func`);
  mkdirSync(dir, { recursive: true });
  await build({
    stdin: { contents: adapter(file), resolveDir: ROOT, sourcefile: `vercel-${name}.js`, loader: 'js' },
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: join(dir, 'index.js'),
    logLevel: 'warning',
  });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
  writeFileSync(
    join(dir, '.vc-config.json'),
    JSON.stringify(
      { runtime: NODE_RUNTIME, handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: MAX_DURATION },
      null,
      2,
    ),
  );
  console.log(`[build-vercel] function  /api/${name}  <-  ${file}`);
}

// 3. Routing and security headers
const security = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const config = {
  version: 3,
  routes: [
    { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '^/(.*)$', headers: security, continue: true },
    { handle: 'filesystem' },
    { src: '^/api/(.*)$', status: 404 },
    { src: '^/(.*)$', dest: '/index.html' },
  ],
};
writeFileSync(join(OUT, 'config.json'), JSON.stringify(config, null, 2));
console.log(`[build-vercel] Build Output ready: ${apiFiles.length} function(s) + static site in .vercel/output`);
