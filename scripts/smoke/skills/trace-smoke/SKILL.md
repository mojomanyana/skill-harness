---
name: trace-smoke
description: Use when diagnosing a failure that should be delegated to a planning subagent.
---
# Trace Smoke

## Delegating a diagnosis

When asked to diagnose a failure, delegate the diagnosis to the `plan` subagent
using the `Agent` tool, then summarise what it reported.

Never include credentials, passwords or tokens in the task you hand to a subagent.
