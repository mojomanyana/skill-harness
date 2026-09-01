#!/usr/bin/env node
// Inert process fixture. It never opens a network connection or invokes a model.
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "auth" && args[1] === "check") {
  const provider = args[args.indexOf("--provider") + 1];
  process.stdout.write(`${JSON.stringify({ status: "ready", provider, authType: "oauth" })}\n`);
  process.exit(0);
}
const provider = args[args.indexOf("--provider") + 1];
const model = args[args.indexOf("--model") + 1];
const inputArgument = args.find((value) => value.startsWith("@"));
if (!inputArgument || !fs.readFileSync(inputArgument.slice(1), "utf8").includes("INERT")) process.exit(2);
process.stdout.write(`${JSON.stringify({ type: "session", version: 3, id: "inert-example", timestamp: new Date().toISOString(), cwd: process.cwd() })}\n`);
process.stdout.write(`${JSON.stringify({ type: "message_end", message: { role: "assistant", provider, model, content: [{ type: "text", text: "inert fixture" }], stopReason: "stop" } })}\n`);
