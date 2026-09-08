import { expect, it } from 'vitest';
import { probeLocalCodexProfile, CODEX_LOCAL_PROFILE } from '../src/codex-model-profile.js';
// Real kernel/process conformance is examples/codex-local-boundary/probe.mjs;
// ordinary portable tests do not silently install/skip a Linux dependency.
it('exposes a fixed no-egress probe, not an arbitrary model executor',()=>{expect(Object.isFrozen(CODEX_LOCAL_PROFILE)).toBe(true);expect(CODEX_LOCAL_PROFILE).toMatchObject({network:'unshared-no-egress',arbitraryCode:false,modelExecutionQualified:false,cpuSeconds:2,nofile:64,heapMiB:32});});
it('cannot substitute a command, provider, arbitrary frame or runtime environment',async()=>{await expect(probeLocalCodexProfile('bad\nframe')).rejects.toThrow(/identity/);await expect(probeLocalCodexProfile({command:'curl'} as any)).rejects.toThrow(/identity/);});
