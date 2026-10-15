# Pi 1.1.0 transport capture

This fixture was produced by actual Pi 1.1.0 against a scripted local HTTP
provider on 2026-10-15. It is transport evidence, not a research-quality score
or subscription-authentication check. The matching candidate was also run
against Pi 1.0.4. Neither version is inferred from a semver range.

`provenance.json` binds the raw event stream, exact capture script, two run
summaries, relevant source snapshots and Docker image. The script is adapted
from the earlier Scout transport probe. Its retained summaries still contain
the original Scout candidate label and one `published harness` description;
these are legacy report metadata. Both runs mounted this candidate's compiled
core, adapter and CLI packages over the image's installed package code.

Both runs exercised red/green/force delivery, final settlement, a successful
CLI pipeline, separate objective/judge failures, and disabled undeclared MCP
access. The scripted judge asserts that no tools are advertised, including
after a usable MCP server has been configured. The positive MCP control proves
that the server can otherwise run. `success.jsonl` is that real Pi 1.1.0
positive-control stream; its tool result is synthetic public text.

The image used was the already-built local `pi-scout-offline:test`, pinned by
ID in provenance. It contains Pi 1.0.4 at
`/opt/harness-pi/node_modules/.bin/pi`, Pi 1.1.0 at `/usr/local/bin/pi`, and the
public Scout skill at `/opt/research`. It is not a published test dependency.
Reproduction needs that image or a rebuilt equivalent; merely replaying the
stored stream is a regression check, not fresh qualification.

After compiling the candidate, the original invocation used a container with
`--network none --read-only --cap-drop ALL --security-opt no-new-privileges`,
scratch `/workspace` and `/tmp` tmpfs mounts, `HOME=/workspace`, and no host
credentials. Mount `capture.mjs` as `/opt/evals/current-smoke.mjs`, an empty
output directory as `/qualification`, and the current `packages/{core,adapters,cli}/dist`
over `/opt/reference-pi110/node_modules/@skill-harness/{core,adapters,cli}/dist`.
Set `SCOUT_HARNESS_PI110=1` and invoke the mounted script using the image's
Node entrypoint. For 1.0.4 omit that variable and mount the three packages
under `/opt/reference` instead. This selection changes only the exact Pi
executable and package location, not the parser contract.

No live model call, credentials, pi-daddy child execution, online containment,
or Pi version other than 1.0.4 and 1.1.0 is qualified by this capture.
