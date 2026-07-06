#!/usr/bin/env node
// Thin launcher: import @skill-harness/cli's main entry, which auto-runs the CLI
// (cli.ts dispatches main(process.argv.slice(2)) on import unless process.env.VITEST is set).
import "@skill-harness/cli";
