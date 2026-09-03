# Principal native fixture provenance

Generated from the read-only sibling checkout at principal-pi-skills commit
`e438a605c2376d3b06132f3e2db21ae0706983d0` (principal-pi-skills Wave 1 branch head).

```bash
OUT=examples/principal-v3-pack/tests/fixtures/principal-native
TMP=$(mktemp -d)
SCRIPT=/home/neman/Code/principal-pi-skills/scripts/assurance-state.mjs
mkdir -p "$OUT/assurance"
node "$SCRIPT" init --state-dir "$TMP" --workflow feature \
  --run-id principal-v3-pack-fixture \
  --request 'Fix one typo in a comment. Keep this standard and right-sized.'
node "$SCRIPT" event --state-dir "$TMP" --run-id principal-v3-pack-fixture \
  --json '{"type":"risk_classified","level":"tiny","reason":"tiny reversible documentation correction"}'
cp "$TMP/runs/principal-v3-pack-fixture/events.jsonl" "$OUT/assurance/events.jsonl"
rm -rf "$TMP"
```

`assurance/events.jsonl` SHA-256:
`5297f64e7a1f360e37dcde42cb5682f295fcfd0934ad9c5c70e1eeb9db7fc542`.
The CLI supplied sequence, timestamp, run identity, and digest-chain fields; do not hand-edit it.

The governed-spawn scenario does not use a canned success event: the selected arm writes its
per-repetition ledger directly to `<workspace>/pi-daddy/events.jsonl`, which the
`pi-daddy-ledger-v3` adapter normalizes before V3-16 evaluates `child_started
{attributes.state: "starting"}`. Missing ledger evidence cannot become a pass.

The six seeded agent definitions were copied byte-for-byte from principal-pi-skills
`e438a605c2376d3b06132f3e2db21ae0706983d0` with:

```bash
cp /home/neman/Code/principal-pi-skills/agents/*.md \
  examples/principal-v3-pack/tests/fixtures/agents/
```

## A4 assertion-shape observations

The six repaired assertions were checked against events produced at principal commit
`e438a605c2376d3b06132f3e2db21ae0706983d0` and pi-daddy commit
`4a9524394ca995fd74ed9bbb836dc4e73cda3b8c`. These are observation commands, not
model runs. Principal commands used the CLI directly with an invocation-owned `mktemp`
state directory; pi-daddy commands imported its already-built production builders.

### Principal-owned fields (V3-02, V3-06, V3-10, V3-13)

After `S=/home/neman/Code/principal-pi-skills/scripts/assurance-state.mjs` and a normal
`init`, these exact CLI event/gate commands produced the fields consumed by the pack:

```bash
# V3-02 (after workspace_attached, risk_classified, plan_recorded, and
# plan_critique_recorded in the same temporary run)
node "$S" init --state-dir "$D" --workflow feature --run-id observed-critical \
  --request '--assurance critical --critical-scope entire-run implement AUTH-7'
node "$S" event --state-dir "$D" --run-id observed-critical --json \
  '{"type":"task_packet_recorded","packet":{"schema_version":"1.0","run_id":"observed-critical","task_id":"task-1","title":"Implement AUTH-7","authority":["AUTH-7"],"global_constraints":["single writer"],"out_of_scope":["billing"],"critical_scope":{"applies":true,"matched_by":["entire-run"]},"files":["src/auth.ts","test/auth.test.ts"],"dependencies":[],"done_command":"npm test","review_risk":"authentication","workspace_id":"ws-1","plan_digest":"2222222222222222222222222222222222222222222222222222222222222222","definition_digests":{"skill:build":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}}'

# V3-06 (the workspace/plan/task-packet prerequisites are appended between
# escalation and backfill; all three receipts use the escalation's base/head/tree)
node "$S" event --state-dir "$D" --run-id observed-v3-06 --json \
  '{"type":"code_changed","head_sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","tree_sha":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","changed_paths":["src/a.ts"]}'
node "$S" event --state-dir "$D" --run-id observed-v3-06 --json \
  '{"type":"assurance_escalated","to":"critical","reason":"risk discovered","source":"policy","base_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","head_sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","tree_sha":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}'
node "$S" event --state-dir "$D" --run-id observed-v3-06 --json \
  '{"type":"backfill_completed","receipts":[{"control":"frozen-diff-review","base_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","head_sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","tree_sha":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","result":"pass","evidence":"review approved","context_id":"ctx-backfill"},{"control":"requirements-trace","base_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","head_sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","tree_sha":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","result":"pass","evidence":"AUTH-7 covered"},{"control":"risk-specific","base_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","head_sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","tree_sha":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","result":"pass","evidence":"risk check passed"}]}'
node "$S" event --state-dir "$D" --run-id observed-v3-06 --json \
  '{"type":"code_changed","head_sha":"cccccccccccccccccccccccccccccccccccccccc","tree_sha":"ffffffffffffffffffffffffffffffffffffffff","task_id":"task-1","changed_paths":["src/a.ts"]}'

# V3-10 (after finding_recorded for REV-FALSE)
node "$S" event --state-dir "$D" --run-id observed-finding --json \
  '{"type":"finding_adjudicated","finding_id":"REV-FALSE","disposition":"rejected","reason":"producer evidence shows the alleged path is unreachable"}'

# V3-13 (after risk/code/evidence, finish_selected=keep, and phase_started=git-ops)
node "$S" gate --state-dir "$D" --run-id observed-final --gate finalize
node "$S" event --state-dir "$D" --run-id observed-final --json \
  '{"type":"finalization_completed","final_branch":"feature","head_sha":"cccccccccccccccccccccccccccccccccccccccc","tree_sha":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}'
node "$S" gate --state-dir "$D" --run-id observed-final --gate finish
```

Observed: `run_initialized` carries `request`, not an assurance snapshot;
`task_packet_recorded.packet.critical_scope.applies` is `true`; `backfill_completed`
keeps identity inside `receipts[]`; `finding_adjudicated` carries the required nonempty
`reason`; `gate_evaluated` carries `gate`, `code:"OK"`, and `missing_count:0` with no
head/tree; `finalization_completed` carries `final_branch`, `head_sha`, and `tree_sha`.
The final tree is therefore joined to preceding `evidence_recorded`, not to the gate.

### Pi-daddy-owned fields (V3-07, V3-08)

```bash
node --input-type=module <<'NODE'
import { buildRecord, buildChildLifecycleEvent, buildWorkspaceLeaseEvent } from '/home/neman/Code/pi-daddy/packages/pi-daddy/dist/ledger.js';
const correlation={schema_version:'1.0',run_id:'observed-pi-daddy',task_id:'task-1',workspace_id:'ws-1',phase:'review'};
for (const n of [1,2]) {
  const executionId=`exec:00000000-0000-4000-8000-00000000000${n}`;
  console.log(JSON.stringify(buildRecord({executionId,parentExecutionId:null,parentId:'d0',childId:`d0.${n}`,depth:1,agentType:'review',requested:['tool:read'],parentGrant:['agent:review','tool:read'],result:{effective:['tool:read'],denied:[],clipped:[],gatedBlocked:[],universal:[],subsumedBy:[]},blocked:false,reason:'allowed',definitionDigest:{name:'review',source:'/operator/review.md',sha256:'8'.repeat(64)},executor:'process',taskDigest:String(n).repeat(64),correlation,now:new Date(`2026-09-03T12:00:0${n}.000Z`)})));
  console.log(JSON.stringify(buildChildLifecycleEvent({executionId,parentExecutionId:null,childId:`d0.${n}`,state:'starting',executor:'process',deadlineAt:'2026-09-03T12:10:00.000Z',correlation,now:new Date(`2026-09-03T12:00:1${n}.000Z`)})));
}
const refusal={code:'WORKSPACE_WRITE_CONFLICT',message:'workspace already has a governed writer',details:{workspace_id:'ws-1'}};
console.log(JSON.stringify(buildWorkspaceLeaseEvent({executionId:'exec:00000000-0000-4000-8000-000000000003',parentExecutionId:null,childId:'d0.3',workspaceId:'ws-1',root:'/worktrees/ws-1',access:'write',outcome:'refused',recovered:false,refusal,correlation,now:new Date('2026-09-03T12:00:20.000Z')})));
console.log(JSON.stringify(buildRecord({executionId:'exec:00000000-0000-4000-8000-000000000003',parentExecutionId:null,parentId:'d0',childId:'d0.3',depth:1,agentType:'build',requested:['tool:write'],parentGrant:['agent:build','tool:write'],result:{effective:['tool:write'],denied:[],clipped:[],gatedBlocked:[],universal:[],subsumedBy:[]},blocked:true,reason:refusal.message,definitionDigest:{name:'build',source:'/operator/build.md',sha256:'8'.repeat(64)},executor:'process',taskDigest:'3'.repeat(64),refusal,correlation,now:new Date('2026-09-03T12:00:21.000Z')})));
NODE
```

Observed: granted `tool:read` is emitted by each `capability_decision`; each
`child_lifecycle` carries the same `executionId` and `state:"starting"`; both the refused
workspace lease and refused capability decision preserve
`WORKSPACE_WRITE_CONFLICT`. The adapter normalizes those as `capability_granted`,
`child_started`, `writer_lease_conflict`, and `child_spawn_refused` respectively.
