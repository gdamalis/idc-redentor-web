/**
 * PARITY TEST (ICR-147).
 *
 * apps/web is the Vercel Root Directory, so app code cannot import out of itself into
 * .claude/. The guard therefore exists twice: the canonical TypeScript (voiceProfile.ts)
 * and the .mjs twin the /predica orchestrator actually executes. A hand-mirrored validator
 * that silently drifts from its canon is the SAME class of invisible-compounding bug this
 * ticket exists to kill — so the mirror is bound here rather than by a comment.
 *
 * Every case runs through BOTH impls; the twin's JSON + exit code must agree with the TS
 * verdict on every row. Break the twin and this goes red.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  canLearnVoiceFrom,
  type VoiceLearnDecision,
} from "@src/utils/predica/voiceProfile";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// apps/web/src/utils/predica -> repo root is five levels up.
const REPO_ROOT = path.resolve(HERE, "../../../../..");
const TWIN = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/check-voice-learn.mjs",
);

/** Run the twin exactly as the orchestrator does. */
function runTwin(args: string[]): {
  decision: VoiceLearnDecision;
  status: number;
} {
  const res = spawnSync("node", [TWIN, ...args], { encoding: "utf8" });
  if (res.error) throw res.error;
  return {
    decision: JSON.parse(res.stdout) as VoiceLearnDecision,
    status: res.status ?? -1,
  };
}

/** The single case table both impls must agree on. */
const CASES: Array<{
  name: string;
  interpreted: boolean;
  preacher: string;
  args: string[];
}> = [
  {
    name: "interpreted, under the preacher's name",
    interpreted: true,
    preacher: "Doug Wagner",
    args: ["--preacher", "Doug Wagner", "--interpreted"],
  },
  {
    name: "interpreted, under the interpreter's own name",
    interpreted: true,
    preacher: "Jonathan Hanegan",
    args: ["--preacher", "Jonathan Hanegan", "--interpreted"],
  },
  {
    name: "normal run",
    interpreted: false,
    preacher: "Jonathan Hanegan",
    args: ["--preacher", "Jonathan Hanegan"],
  },
  {
    name: "accented name",
    interpreted: false,
    preacher: "Jonathan Hanegán",
    args: ["--preacher", "Jonathan Hanegán"],
  },
  {
    name: "missing preacher",
    interpreted: false,
    preacher: "   ",
    args: ["--preacher", "   "],
  },
];

describe("check-voice-learn.mjs is in parity with voiceProfile.ts", () => {
  it.each(CASES)("$name", ({ interpreted, preacher, args }) => {
    const expected = canLearnVoiceFrom({ interpreted, preacher });
    const { decision, status } = runTwin(args);

    expect(decision).toEqual(expected);
    expect(status).toBe(expected.ok ? 0 : 3);
  });
});

describe("check-voice-learn.mjs CLI contract", () => {
  it("--interpreter implies --interpreted (the implication only ever runs toward MORE guarding)", () => {
    const { decision, status } = runTwin([
      "--preacher",
      "Doug Wagner",
      "--interpreter",
      "Jonathan Hanegan",
    ]);
    expect(decision).toEqual({ ok: false, reason: "interpreted" });
    expect(status).toBe(3);
  });

  it("refuses a REGENERATE that forgot the flag, reading interpreted from the persisted sermon.json", () => {
    const sermon = path.join(
      REPO_ROOT,
      "apps/web/src/utils/predica/__fixtures__/interpreted-sermon.json",
    );
    const { decision, status } = runTwin([
      "--preacher",
      "Doug Wagner",
      "--sermon",
      sermon,
    ]);
    expect(decision).toEqual({ ok: false, reason: "interpreted" });
    expect(status).toBe(3);
  });

  it("allows a regenerate of a NON-interpreted sermon.json (no regression to the normal path)", () => {
    const sermon = path.join(
      REPO_ROOT,
      "apps/web/src/utils/predica/__fixtures__/plain-sermon.json",
    );
    const { decision, status } = runTwin([
      "--preacher",
      "Jonathan Hanegan",
      "--sermon",
      sermon,
    ]);
    expect(decision).toEqual({ ok: true, preacherSlug: "jonathan-hanegan" });
    expect(status).toBe(0);
  });

  it("REFUSES a sermon.json whose `interpreted` is malformed (the string \"true\") — fail closed", () => {
    // sermon.json is written by an LLM and may be hand-edited. A strict `=== true` check read
    // "true" as NOT interpreted and allowed the profile write — the guard's own hole. The twin
    // must fail closed exactly like the canon does.
    const sermon = path.join(
      REPO_ROOT,
      "apps/web/src/utils/predica/__fixtures__/malformed-interpreted-sermon.json",
    );
    const { decision, status } = runTwin(["--preacher", "Doug Wagner", "--sermon", sermon]);
    expect(decision).toEqual({ ok: false, reason: "interpreted" });
    expect(status).toBe(3);
  });

  it("exits 2 on an unreadable --sermon path (a usage error, distinct from a refusal)", () => {
    const res = spawnSync(
      "node",
      [TWIN, "--preacher", "X", "--sermon", "/nope/missing.json"],
      {
        encoding: "utf8",
      },
    );
    expect(res.status).toBe(2);
  });
});
