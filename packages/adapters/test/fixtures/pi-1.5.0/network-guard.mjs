// Fixture safety guard, not an OS sandbox. Only the scripted loopback server is reachable.
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const attempts = [];
const port = Number(process.env.PI_FIXTURE_PORT);
function check(kind, host, selectedPort) {
  const allowed = host === '127.0.0.1' && Number(selectedPort) === port;
  if (attempts.length < 100) attempts.push({ kind, host: String(host), port: Number(selectedPort), allowed });
  if (!allowed) throw Error(`Offline qualification refused network: ${kind}`);
}
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof options === 'object') check('socket', options.host ?? 'localhost', options.port);
  else check('socket', typeof args[1] === 'string' ? args[1] : 'localhost', options);
  return socketConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, ...args) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  check('fetch', url.hostname, url.port || (url.protocol === 'https:' ? 443 : 80));
  return originalFetch.call(this, input, ...args);
};
for (const [module, prefix] of [[http, 'http'], [https, 'https']]) {
  for (const key of ['request', 'get']) {
    const original = module[key];
    module[key] = function (input, ...args) {
      const options = typeof input === 'string' || input instanceof URL ? new URL(input) : input;
      check(`${prefix}.${key}`, options.hostname ?? options.host ?? 'localhost', options.port || (prefix === 'https' ? 443 : 80));
      return original.call(this, input, ...args);
    };
  }
}
tls.connect = () => { check('tls', 'blocked', 0); };
dgram.createSocket = () => { check('dgram', 'blocked', 0); };
syncBuiltinESMExports();
process.on('exit', () => writeFileSync(join(process.env.PI_FIXTURE_GUARD_DIR, `${process.pid}.json`),
  JSON.stringify({ pid: process.pid, attempts, blocked: attempts.filter(item => !item.allowed).length }), { flag: 'wx' }));
