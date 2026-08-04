// script(1) classic timing log + output log  ->  asciicast v2, for agg to render.
//
// The classic timing format is one "<delay> <bytes>" line per write: delay in
// seconds since the previous write, bytes written. So the output log is consumed
// as a byte stream in exactly the order the pty produced it, with real delays —
// nothing about the timing is synthesised.
//
//   node script2cast.mjs timing.log out.log cast.cast 110 30
import { readFileSync, writeFileSync } from 'node:fs';

const [timingPath, outPath, castPath, cols, rows] = process.argv.slice(2);
if (!castPath) {
  console.error('usage: script2cast.mjs <timing.log> <out.log> <cast> [cols] [rows]');
  process.exit(2);
}

const timing = readFileSync(timingPath, 'utf8').split('\n').filter(Boolean);
let out = readFileSync(outPath); // Buffer — the log is raw bytes, not text

// script(1) writes its own "Script started on ..." banner straight into the log
// file (even under -q) and those bytes are NOT accounted for in the timing log,
// so leaving them in shifts every subsequent chunk by the banner's length.
if (out.subarray(0, 20).toString('latin1').startsWith('Script started on')) {
  out = out.subarray(out.indexOf(0x0a) + 1);
}
const doneAt = out.lastIndexOf(Buffer.from('\nScript done on'));
if (doneAt !== -1) out = out.subarray(0, doneAt + 1);

const header = {
  version: 2,
  width: Number(cols ?? 110),
  height: Number(rows ?? 30),
  env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
};

const lines = [JSON.stringify(header)];
let clock = 0;
let cursor = 0;

for (const line of timing) {
  const [delayRaw, countRaw] = line.split(' ');
  const delay = Number.parseFloat(delayRaw);
  const count = Number.parseInt(countRaw, 10);
  if (!Number.isFinite(delay) || !Number.isFinite(count)) continue;

  clock += delay;
  const chunk = out.subarray(cursor, cursor + count);
  cursor += count;
  if (chunk.length === 0) continue;

  // Decoding per-chunk can split a multi-byte sequence across events. Harmless
  // for this content (box-drawing and ✓/✗ arrive in single writes) and agg
  // concatenates the stream before parsing anyway.
  lines.push(JSON.stringify([Number(clock.toFixed(6)), 'o', chunk.toString('utf8')]));
}

writeFileSync(castPath, lines.join('\n') + '\n', 'utf8');
console.error(`${lines.length - 1} events, ${clock.toFixed(2)}s, ${cursor}/${out.length} bytes consumed`);
