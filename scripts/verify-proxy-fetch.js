import { createServer } from 'node:http';
import { connect } from 'node:net';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function listen (server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function closeServer (server) {
  return new Promise(resolve => {
    server.close(() => resolve());
  });
}

async function compileProxyFetch () {
  const root = join(process.cwd(), 'tmp');
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'aicat-proxy-fetch-'));
  await writeFile(join(dir, 'package.json'), '{"type":"module"}\n', 'utf-8');

  await execFileAsync(process.execPath, [
    'node_modules/typescript/bin/tsc',
    'src/utils/proxy-fetch.ts',
    '--target',
    'ES2022',
    '--module',
    'ES2022',
    '--moduleResolution',
    'bundler',
    '--skipLibCheck',
    '--esModuleInterop',
    '--rootDir',
    'src',
    '--outDir',
    dir,
  ]);

  return {
    dir,
    moduleUrl: pathToFileURL(join(dir, 'utils/proxy-fetch.js')).href,
  };
}

function createUpstream () {
  return createServer((req, res) => {
    if (req.url !== '/probe') {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('proxy-ok');
  });
}

function createProxy (state) {
  const server = createServer((clientReq, clientRes) => {
    state.httpRequests++;

    let target;
    try {
      target = new URL(clientReq.url || '');
    } catch {
      clientRes.writeHead(400);
      clientRes.end('bad proxy url');
      return;
    }

    fetch(target)
      .then(async upstreamRes => {
        clientRes.writeHead(upstreamRes.status, Object.fromEntries(upstreamRes.headers.entries()));
        clientRes.end(Buffer.from(await upstreamRes.arrayBuffer()));
      })
      .catch(error => {
        clientRes.writeHead(502);
        clientRes.end(String(error));
      });
  });

  server.on('connect', (req, clientSocket, head) => {
    state.connectRequests++;
    const [host, portText] = String(req.url || '').split(':');
    const upstreamSocket = connect(Number(portText || 80), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });

    upstreamSocket.on('error', () => clientSocket.destroy());
  });

  return server;
}

async function main () {
  const compiled = await compileProxyFetch();
  const upstream = createUpstream();
  const proxyState = { httpRequests: 0, connectRequests: 0 };
  const proxy = createProxy(proxyState);

  try {
    const upstreamPort = await listen(upstream);
    const proxyPort = await listen(proxy);
    const { fetchWithProxy } = await import(compiled.moduleUrl);

    const res = await fetchWithProxy(
      `http://127.0.0.1:${upstreamPort}/probe`,
      {},
      `http://127.0.0.1:${proxyPort}`
    );

    const text = await res.text();
    if (text !== 'proxy-ok') {
      throw new Error(`unexpected upstream response: ${text}`);
    }

    if (proxyState.httpRequests + proxyState.connectRequests < 1) {
      throw new Error('proxy did not receive the request');
    }

    let unsupportedFailed = false;
    try {
      await fetchWithProxy(`http://127.0.0.1:${upstreamPort}/probe`, {}, 'socks5://127.0.0.1:1080');
    } catch {
      unsupportedFailed = true;
    }

    if (!unsupportedFailed) {
      throw new Error('unsupported proxy protocol did not fail');
    }

    console.log('proxy fetch verification passed');
  } finally {
    await Promise.allSettled([
      closeServer(proxy),
      closeServer(upstream),
      rm(compiled.dir, { recursive: true, force: true }),
    ]);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
