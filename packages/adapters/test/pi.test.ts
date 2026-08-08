import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock core's exec before importing the adapter.
vi.mock("@skill-harness/core", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@skill-harness/core")>();
  return { ...orig, exec: vi.fn(), onPath: () => true };
});

import { piAdapter } from "../src/pi.js";
import { exec } from "@skill-harness/core";

const mockedExec = vi.mocked(exec);

/** A real skill dir on disk — the adapter refuses one that isn't there (see requireSkillDir). */
function fakeSkill(body = "---\nname: s\ndescription: d\n---\n\n## Do the thing\n"): string {
  const dir = mkdtempSync(join(tmpdir(), "sc-skill-"));
  writeFileSync(join(dir, "SKILL.md"), body, "utf8");
  return dir;
}

beforeEach(() => {
  mockedExec.mockReset();
  mockedExec.mockResolvedValue({ code: 0, stdout: "USER: hi\nASSISTANT: ok\nVERDICT: PASS", stderr: "" });
});

describe("pi adapter nested-run safety", () => {
  it("green-mode subject run passes --no-extensions and still --skill", async () => {
    await piAdapter.run({
      skillDir: fakeSkill(),
      model: { provider: "fireworks", model: "x" },
      mode: "green",
      turns: ["hi"],
      cwd: "/tmp",
    });
    const [cmd, args] = mockedExec.mock.calls[0];
    expect(cmd).toBe("pi");
    expect(args).toContain("--no-extensions");
    expect(args).toContain("--skill");
  });

  it("non-claude-code judge passes --no-extensions", async () => {
    await piAdapter.judge({
      model: { provider: "fireworks", model: "x" },
      prompt: "p",
      cwd: "/tmp",
    });
    const [cmd, args] = mockedExec.mock.calls[0];
    expect(cmd).toBe("pi");
    expect(args).toContain("--no-extensions");
  });
});

describe("skill-delivery tripwire", () => {
  // pi 0.83.0, verified: `pi --skill /nonexistent -p "hi"` answers normally and exits
  // 0. So the only thing standing between a mistyped path and a whole wave of
  // naked-model results that look plausible is this check.
  it("refuses a missing skill dir in green mode instead of measuring a naked model", async () => {
    await expect(piAdapter.run({
      skillDir: join(tmpdir(), "sc-not-here-at-all"),
      model: { provider: "fireworks", model: "x" },
      mode: "green",
      turns: ["hi"],
      cwd: "/tmp",
    })).rejects.toThrow(/needs a skill directory with a SKILL.md/);
    expect(mockedExec).not.toHaveBeenCalled();
  });

  it("refuses a dir with no SKILL.md, and says which path it resolved", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sc-empty-skill-"));
    await expect(piAdapter.run({
      skillDir: dir, model: { provider: "fireworks", model: "x" }, mode: "green",
      turns: ["hi"], cwd: "/tmp",
    })).rejects.toThrow(new RegExp(`${dir} has none`));
  });

  it("resolves a relative skill dir before handing it to pi (the child runs in another cwd)", async () => {
    const root = mkdtempSync(join(tmpdir(), "sc-skills-root-"));
    mkdirSync(join(root, "build"));
    writeFileSync(join(root, "build", "SKILL.md"), "---\nname: build\n---\n## Ship it\n", "utf8");
    const cwd = process.cwd();
    try {
      process.chdir(root);
      await piAdapter.run({
        skillDir: "build", // what `--skills .` used to produce
        model: { provider: "fireworks", model: "x" }, mode: "green",
        turns: ["hi"], cwd: "/tmp",
      });
    } finally {
      process.chdir(cwd);
    }
    const [, args] = mockedExec.mock.calls[0];
    const passed = args[args.indexOf("--skill") + 1];
    expect(passed).toBe(join(root, "build"));
  });

  it("force mode is checked too — an absent SKILL.md is not a silent empty system prompt", async () => {
    await expect(piAdapter.run({
      skillDir: join(tmpdir(), "sc-not-here-either"),
      model: { provider: "fireworks", model: "x" }, mode: "force",
      turns: ["hi"], cwd: "/tmp",
    })).rejects.toThrow(/mode=force needs a skill directory/);
  });
});

describe("harness CLI version", () => {
  it("reports what `pi --version` printed", async () => {
    mockedExec.mockResolvedValueOnce({ code: 0, stdout: "0.83.0\n", stderr: "" });
    expect(await piAdapter.version!()).toBe("0.83.0");
  });

  it("tolerates a `pi 1.2.3` shape", async () => {
    mockedExec.mockResolvedValueOnce({ code: 0, stdout: "pi version 1.2.3\n", stderr: "" });
    expect(await piAdapter.version!()).toBe("1.2.3");
  });

  it("is null when pi cannot say — provenance is never guessed", async () => {
    mockedExec.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "unknown flag" });
    expect(await piAdapter.version!()).toBeNull();
    mockedExec.mockRejectedValueOnce(new Error("ENOENT"));
    expect(await piAdapter.version!()).toBeNull();
  });
});

describe("agent-file runs", () => {
  it("uses the file as the system prompt and activates no skill", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sc-agentfile-"));
    const file = join(dir, "plan.md");
    writeFileSync(file, "# Plan agent\nYou are single-shot.", "utf8");

    await piAdapter.run({
      skillDir: "/does/not/exist", // an agent-file run never touches the skill dir
      model: { provider: "fireworks", model: "x" },
      mode: "green", // deliberately green: the agent file must win over skill activation
      turns: ["plan this"],
      cwd: "/tmp",
      systemPromptFile: file,
    });
    const [, args] = mockedExec.mock.calls[0];
    expect(args).toContain("--no-skills");
    expect(args).not.toContain("--skill");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("# Plan agent\nYou are single-shot.");
  });
});

describe("controlled extension loading", () => {
  it("passes --no-extensions plus one --extension per declared path", async () => {
    const ext = join(mkdtempSync(join(tmpdir(), "sc-ext-")), "sub.ts");
    writeFileSync(ext, "export default function () {}\n", "utf8");

    await piAdapter.run({
      skillDir: fakeSkill(),
      model: { provider: "fireworks", model: "x" },
      mode: "green",
      turns: ["hi"],
      cwd: "/tmp",
      extensions: [ext],
    });

    const [, args] = mockedExec.mock.calls[0];
    // Both, together: discovery off, exactly one declared extension on. Measured on
    // pi 0.83.0, that pair loads only the declared file even under `-a`.
    expect(args).toContain("--no-extensions");
    expect(args).toContain("--extension");
    expect(args).toContain(ext);
    expect((args as string[]).filter((a) => a === "--extension")).toHaveLength(1);
  });

  it("adds no --extension flag when the scenario declares none", async () => {
    await piAdapter.run({
      skillDir: fakeSkill(),
      model: { provider: "fireworks", model: "x" },
      mode: "green",
      turns: ["hi"],
      cwd: "/tmp",
    });
    expect(mockedExec.mock.calls[0][1]).not.toContain("--extension");
  });

  it("refuses a nonexistent extension instead of starting without it", async () => {
    // pi would start happily, the Agent tool would simply not exist, and the
    // scenario would grade a model that never had the option to delegate.
    await expect(
      piAdapter.run({
        skillDir: fakeSkill(),
        model: { provider: "fireworks", model: "x" },
        mode: "green",
        turns: ["hi"],
        cwd: "/tmp",
        extensions: ["/nonexistent/sub.ts"],
      }),
    ).rejects.toThrow(/does not exist/);
    expect(mockedExec).not.toHaveBeenCalled();
  });
});
