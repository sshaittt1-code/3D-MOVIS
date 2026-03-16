import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { runFeedSmoke } from './feedSmoke.mjs';

const port = parseInt(process.env.RELEASE_VERIFY_PORT || '3310', 10);
const baseUrl = `http://127.0.0.1:${port}`;

const waitForServer = async (url, timeoutMs = 30000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for backend at ${url}`);
};

const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'server.ts'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  }
);

child.stdout.on('data', (chunk) => {
  process.stdout.write(`[release:server] ${chunk}`);
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(`[release:server] ${chunk}`);
});

const shutdown = () => {
  if (!child.killed) {
    child.kill('SIGTERM');
  }
};

process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(143);
});

try {
  await waitForServer(`${baseUrl}/api/version`);
  await runFeedSmoke(baseUrl);
} finally {
  shutdown();
}
