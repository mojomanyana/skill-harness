/**
 * Optional OS-containment seam.
 *
 * The current workspace implementation copies fixtures into temp directories;
 * that is isolation for test data, NOT process/filesystem/network containment.
 * No production backend is registered yet. A container/bwrap implementation can
 * satisfy this interface without teaching scoring or trajectory gates about one
 * particular sandbox runtime.
 */
export type SandboxNetworkPolicy = "allow" | "deny";

export interface SandboxRequest {
  sourceWorkspace: string;
  network: SandboxNetworkPolicy;
}

export interface SandboxSession {
  cwd: string;
  captureDiff(): Promise<string>;
  cleanup(): Promise<void>;
}

export interface SandboxBackend {
  name: string;
  /** `os` is a backend claim; `none` must never be presented as containment. */
  containment: "os" | "none";
  prepare(request: SandboxRequest): Promise<SandboxSession>;
}

export interface SandboxRunResult<T> {
  value: T;
  diff: string;
  backend: string;
  containment: SandboxBackend["containment"];
}

export async function withSandbox<T>(
  backend: SandboxBackend,
  request: SandboxRequest,
  run: (session: SandboxSession) => Promise<T>,
): Promise<SandboxRunResult<T>> {
  const session = await backend.prepare(request);
  try {
    const value = await run(session);
    const diff = await session.captureDiff();
    return { value, diff, backend: backend.name, containment: backend.containment };
  } finally {
    await session.cleanup();
  }
}
