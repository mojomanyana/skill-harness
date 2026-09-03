#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
if (rootIndex >= 0 && !args[rootIndex + 1]) throw new Error("--root requires a directory");
const root = resolve(rootIndex >= 0 ? args[rootIndex + 1] : process.cwd());

const repositories = [
  {
    name: "mojomanyana/principal-pi-skills",
    marker: "principal-pi-skills",
    checkout: resolve(process.env.PRINCIPAL_PI_SKILLS_CHECKOUT ?? join(root, "../principal-pi-skills")),
  },
  {
    name: "mojomanyana/pi-daddy",
    marker: "pi-daddy",
    checkout: resolve(process.env.PI_DADDY_CHECKOUT ?? join(root, "../pi-daddy")),
  },
];

function provenanceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules", "dist"].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return provenanceFiles(path);
    const name = basename(path);
    return name.endsWith("PROVENANCE.md") || name === "PINNED.json" ? [path] : [];
  });
}

function recordedCommits(path, text) {
  if (path.endsWith("PINNED.json")) {
    const record = JSON.parse(text);
    if (typeof record.repository !== "string" || typeof record.commit !== "string") {
      throw new Error(`${path}: PINNED.json must record repository and commit`);
    }
    return [{ commit: record.commit, repositories: repositories.filter((repo) => record.repository.includes(repo.marker)) }];
  }
  const records = [...text.matchAll(/\bcommit\s+`?([0-9a-f]{40})`?/gi)].map((match) => {
    const prefix = text.slice(0, match.index).toLowerCase();
    const nearest = repositories
      .map((repository) => ({ repository, index: prefix.lastIndexOf(repository.marker) }))
      .filter((candidate) => candidate.index >= 0)
      .sort((a, b) => b.index - a.index)[0]?.repository;
    return { commit: match[1], repositories: nearest ? [nearest] : [] };
  });
  return [...new Map(records.map((record) => [`${record.repositories[0]?.name}:${record.commit}`, record])).values()];
}

const identities = [];
for (const path of provenanceFiles(root)) {
  const text = readFileSync(path, "utf8");
  const records = recordedCommits(path, text);
  if (records.length === 0) throw new Error(`${path}: provenance file records no 40-character commit identity`);
  for (const record of records) {
    if (record.repositories.length === 0) throw new Error(`${path}: commit ${record.commit} has no recognized named repository`);
    const resolved = record.repositories.filter((repository) => {
      try {
        return execFileSync("git", ["-C", repository.checkout, "cat-file", "-t", record.commit], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim() === "commit";
      } catch {
        return false;
      }
    });
    if (resolved.length === 0) {
      throw new Error(`${path}: commit ${record.commit} does not resolve in any repository it names`);
    }
    identities.push(`${resolved[0].name}@${record.commit}`);
  }
}

console.log(`all ${identities.length} recorded provenance commit identity/identities resolve`);
for (const identity of identities) console.log(`  ✓ ${identity}`);
