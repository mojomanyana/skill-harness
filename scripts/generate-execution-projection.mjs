#!/usr/bin/env node
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { ingestRetainedExecution, projectRetainedExecutions } from '../packages/adapters/dist/execution-retention-archive.js';
import { EXECUTION_ARCHIVE_PROJECTION_SCHEMA } from '../packages/adapters/dist/execution-projection-schema.js';
const mode = process.argv[2]; if (!['--write', '--check'].includes(mode)) throw Error('usage: generate-execution-projection.mjs --write|--check (after direct build)');
const fixtures = 'contracts/pi-daddy/execution-retention/v2/fixtures';
const root = mkdtempSync(join(tmpdir(), 'execution-projection-fixture-'));
try {
  const projections = readdirSync(fixtures).filter(name => name.endsWith('.json')).sort().map(name => {
    const manifest = readFileSync(join(fixtures, name)); const wire = JSON.parse(manifest); const blobs = new Map();
    for (const ref of Object.values(wire.content)) if (ref.path) blobs.set(ref.path, readFileSync(join(fixtures, ref.path)));
    return ingestRetainedExecution(root, { manifest, blobs, retention: 'exact' }).projection;
  });
  const output = {
    'contracts/execution-archive/v1/projection.schema.json': EXECUTION_ARCHIVE_PROJECTION_SCHEMA,
    'contracts/execution-archive/v1/fixtures/retained-executions.json': projectRetainedExecutions(projections),
  };
  for (const [path, value] of Object.entries(output)) {
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    if (mode === '--write') { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); }
    else if (!readFileSync(path).equals(bytes)) throw Error(`projection fixture drift: ${path}`);
  }
  console.log('projection schema and real adapter fixture matched; synthetic producer data, no model/worker calls');
} finally { rmSync(root, { recursive: true, force: true }); }
