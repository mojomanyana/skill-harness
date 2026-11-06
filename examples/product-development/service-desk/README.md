# Service desk: a real product-development trial

This example exercises a complete product across three repositories. It uses the
existing Pi, Principal, Daddy, Bookie and Harness interfaces; it adds no execution
engine. Preparing the lab makes no model calls, installs nothing and starts no
services. It is separate from the supplied-context role evaluations.

## Prepare once

With Node and Git available, choose a new absolute directory under an existing
parent. Run `node prepare.mjs /absolute/path/to/new-lab` from this directory.
The helper refuses existing destinations. It creates three repositories in
different parent folders, a synthetic seed commit in each, copied requirements
and a manifest. No existing repository, global Git configuration or permission
store is changed. Inherited Git routing/configuration overrides are excluded and
each new repository is verified before staging. Each preparation gets a fresh
Compose project name, including when a previously used directory name is reused.
A failed preparation leaves its partial directory for inspection.

Run `node --test prepare.test.mjs` for the isolated preparation regression. It
creates and retains disposable Git fixtures; it calls no models or Docker services.

Select the three manifest roots through the ecosystem's normal trusted workspace
selection. A path in a manifest is not a grant. Pending activation, missing access
or a moved target must be resolved explicitly before children run there.

## Run as product work

Choose the subject model in Pi and supply `context/brief.txt`, together with the
three selected repository roots. Let the ecosystem choose an appropriate method.
Keep the independent reviewer separate. The brief is the complete product contract;
`acceptance.json` is a readable observation inventory, not a Harness specification
or an automatic PASS. Execute its browser/API/database checks against the product.

After the first delivery has been accepted and its exact baseline frozen, introduce
`context/follow-up.txt`. It changes the contract and schema and asks for continuation
across repositories. At a settled boundary, restart/reload using supported session
continuation and verify that the exact work resumes without replaying completed
effects. A later user amendment is a new input; refresh only affected evidence.

## Compare models fairly

Use bounded matched tasks from the same frozen baseline for the selected Luna
thinking profiles and operator-chosen flash model. Do not rebuild the entire
product three times by default. Record requested and observed model/effort, tool
access, skill/runtime revisions and criteria. Preserve uncertainty when a provider
does not report effective settings or usage. Keep independent judgment and executable
acceptance; do not treat a passing test count as delivered product value.

Do not use another run's implementation or reviewer answers as model context.
Reuse compatible calibration judgments and unchanged baseline evidence through
Harness. A new model or thinking profile needs new subject answers. Start serially;
resource sampling is not an OS containment or whole-host-health guarantee.

## Closeout

Record the working browser journey, API/database results, findings, repairs,
interventions, elapsed time, reported usage coverage, evidence reuse and remaining
limitations. Distinguish product failure, evaluation failure and infrastructure
failure. Stop only this lab's services and retain its named database volume and
source/evidence unless the operator chooses otherwise. Do not publish or train.
