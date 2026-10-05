// Parallel Planner — three-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):    An opus agent analyzes open issues, builds a dependency
//                      graph, and outputs a <plan> JSON listing unblocked issues
//                      with their target branch names.
//   Phase 2 (Execute): N sonnet agents run in parallel via Promise.allSettled,
//                      each working a single issue on its own branch.
//   Phase 3 (Ship):    Each branch that produced commits is pushed and opened
//                      as a pull request ("Closes #N"). PRs are squash-merged
//                      one at a time once CI passes. If a PR conflicts with
//                      main or fails CI, a sonnet agent fixes it on its branch
//                      first.
//
// The host must be on an up-to-date `main` with a clean working tree, and the
// host's `gh` must be authenticated with permission to push branches and to
// create and merge pull requests.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   npx tsx .sandcastle/main.ts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.ts" }

import { execFileSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { podman } from "@ai-hero/sandcastle/sandboxes/podman";
import { z } from "zod";

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const planSchema = z.object({
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), branch: z.string() }),
  ),
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 10;

// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies.
const hooks = {
  sandbox: { onSandboxReady: [{ command: "npm install" }] },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full npm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree = ["node_modules"];

// The branch PRs target. The host must have it checked out.
const BASE_BRANCH = "main";

// How often the fixer agent may try to make a PR mergeable (conflicts or red
// CI) before the PR is left open for a human.
const MAX_FIX_ATTEMPTS = 2;

// Rootless podman intermittently fails to create a container when several
// start at once (crun: "write to /proc/sys/net/ipv4/ping_group_range").
// Sandbox creation is retried this many times in total before giving up.
const SANDBOX_CREATE_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Host helpers (git / gh run on the host, with the host's credentials)
// ---------------------------------------------------------------------------

const sh = (cmd: string, args: string[]): string =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: "pipe" }).trim();

const shOk = (cmd: string, args: string[], inherit = false): boolean => {
  try {
    execFileSync(cmd, args, { stdio: inherit ? "inherit" : "pipe" });
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Errors from a failed `podman run` include the full command line, env vars
// and all; hide their values before printing.
const redact = (err: unknown) =>
  String(err).replace(/(-e [A-Z_]+=)\S+/g, "$1***");

async function withCreateRetry<T>(
  label: string,
  start: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await start();
    } catch (err) {
      if (
        attempt >= SANDBOX_CREATE_ATTEMPTS ||
        !String(err).includes("create failed")
      ) {
        throw err;
      }
      // Jitter so parallel retries don't collide again.
      const delay = attempt * 5_000 + Math.random() * 5_000;
      console.warn(
        `  ↻ ${label}: sandbox create failed, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${SANDBOX_CREATE_ATTEMPTS})`,
      );
      await sleep(delay);
    }
  }
}

const CONVENTIONAL_TITLE =
  /^(feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(\([\w./-]+\))?!?: .+/;

// The PR title becomes the squash commit on main, so it must be a
// conventional commit. Prefer the title the agent proposed, then the first
// conventional commit subject on the branch, then a generic fallback.
function prTitle(stdout: string, branch: string, issueTitle: string): string {
  const proposed = [...stdout.matchAll(/<pr-title>(.*?)<\/pr-title>/g)]
    .map((m) => m[1]!.trim())
    .filter((t) => CONVENTIONAL_TITLE.test(t))
    .at(-1);
  if (proposed) return proposed;
  const subjects = sh("git", [
    "log",
    "--reverse",
    "--format=%s",
    `${BASE_BRANCH}..${branch}`,
  ]).split("\n");
  return (
    subjects.find((t) => CONVENTIONAL_TITLE.test(t)) ??
    `feat: ${issueTitle.charAt(0).toLowerCase()}${issueTitle.slice(1)}`
  );
}

// Push the branch and open a PR for it, or reuse the open PR from an earlier
// round. Returns the PR number.
function openPullRequest(
  issue: { id: string; title: string; branch: string },
  title: string,
): number {
  sh("git", ["push", "-u", "origin", issue.branch]);
  const existing = JSON.parse(
    sh("gh", [
      "pr",
      "list",
      "--head",
      issue.branch,
      "--state",
      "open",
      "--json",
      "number",
    ]),
  ) as { number: number }[];
  if (existing[0]) return existing[0].number;

  const commits = sh("git", [
    "log",
    "--reverse",
    "--format=- %s",
    `${BASE_BRANCH}..${issue.branch}`,
  ]);
  const url = sh("gh", [
    "pr",
    "create",
    "--base",
    BASE_BRANCH,
    "--head",
    issue.branch,
    "--title",
    title,
    "--body",
    `Closes #${issue.id}\n\n## Commits\n\n${commits}\n\n---\nOpened by Sandcastle.`,
  ]);
  return Number(url.split("/").at(-1));
}

// Wait for CI on the PR's current head. Returns true when every check passed.
async function waitForChecks(pr: number): Promise<boolean> {
  // Checks take a moment to register after a push; `gh pr checks` errors
  // while there are none.
  for (let i = 0; i < 30; i++) {
    let registered = false;
    try {
      registered =
        (JSON.parse(sh("gh", ["pr", "checks", `${pr}`, "--json", "name"])) as [])
          .length > 0;
    } catch {
      // No checks reported yet.
    }
    if (registered) break;
    await sleep(10_000);
  }
  return shOk(
    "gh",
    ["pr", "checks", `${pr}`, "--watch", "--fail-fast", "--interval", "20"],
    true,
  );
}

function pullBase() {
  sh("git", ["pull", "--ff-only", "origin", BASE_BRANCH]);
}

// Refuse to start from anywhere but a clean, current base branch: new issue
// branches are cut from the host's HEAD.
if (sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]) !== BASE_BRANCH) {
  throw new Error(`Check out ${BASE_BRANCH} before running Sandcastle.`);
}
if (sh("git", ["status", "--porcelain"]) !== "") {
  throw new Error("Working tree is not clean. Commit or stash first.");
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  pullBase();

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent (opus, for deeper reasoning) reads the open issue list,
  // builds a dependency graph, and selects the issues that can be worked in
  // parallel right now (i.e., no blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — Output.object parses and validates it.
  // -------------------------------------------------------------------------
  const plan = await sandcastle.run({
    hooks,
    sandbox: podman(),
    name: "planner",
    // One iteration is enough: the planner just needs to read and reason,
    // not write code. (Structured output requires maxIterations: 1.)
    maxIterations: 1,
    // Opus for planning: dependency analysis benefits from deeper reasoning.
    agent: sandcastle.claudeCode("claude-opus-5-5"),
    promptFile: "./.sandcastle/plan-prompt.md",
    // Extract and validate the <plan> JSON into a typed object. Throws
    // StructuredOutputError if the tag is missing, the JSON is malformed, or
    // validation fails — which aborts the loop.
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });

  const issues = plan.output.issues;

  if (issues.length === 0) {
    // No unblocked work — either everything is done or everything is blocked.
    console.log("No unblocked issues to work on. Exiting.");
    break;
  }

  console.log(
    `Planning complete. ${issues.length} issue(s) to work in parallel:`,
  );
  for (const issue of issues) {
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute
  //
  // Spawn one sonnet agent per issue, all running concurrently.
  // Each agent works on its own branch so there are no conflicts during
  // execution — merging happens in Phase 3.
  //
  // Promise.allSettled means one failing agent doesn't cancel the others.
  // -------------------------------------------------------------------------
  const settled = await Promise.allSettled(
    issues.map((issue) =>
      withCreateRetry(issue.branch, () =>
        sandcastle.run({
        hooks,
        copyToWorktree,
        // Each agent starts on its own branch via branchStrategy on run().
        sandbox: podman(),
        branchStrategy: { type: "branch", branch: issue.branch },
        name: "implementer",
        // Give each agent plenty of room to implement and iterate on tests.
        maxIterations: 100,
        // Sonnet for execution: fast and capable enough for typical issue work.
        agent: sandcastle.claudeCode("claude-sonnet-5-5"),
        promptFile: "./.sandcastle/implement-prompt.md",
        // Prompt arguments substitute {{TASK_ID}}, {{ISSUE_TITLE}},
        // and {{BRANCH}} placeholders in implement-prompt.md before the
        // agent sees the prompt.
        promptArgs: {
          TASK_ID: issue.id,
          ISSUE_TITLE: issue.title,
          BRANCH: issue.branch,
        },
      }),
      ),
    ),
  );

  // Log any agents that threw (network error, sandbox crash, etc.).
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      console.error(
        `  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${redact(outcome.reason)}`,
      );
    }
  }

  // Ship every branch that is ahead of main, not only those that got commits
  // in this run: an interrupted earlier run may have left finished work (and
  // an open PR) behind, and the agent finds nothing left to commit.
  const completed = settled.flatMap((outcome, i) =>
    outcome.status === "fulfilled" &&
    Number(
      sh("git", [
        "rev-list",
        "--count",
        `${BASE_BRANCH}..${issues[i]!.branch}`,
      ]),
    ) > 0
      ? [{ issue: issues[i]!, result: outcome.value }]
      : [],
  );

  const completedBranches = completed.map((c) => c.issue.branch);

  console.log(
    `\nExecution complete. ${completedBranches.length} branch(es) ahead of ${BASE_BRANCH}:`,
  );
  for (const branch of completedBranches) {
    console.log(`  ${branch}`);
  }

  if (completedBranches.length === 0) {
    // All agents ran but none made commits — nothing to merge this cycle.
    console.log("No commits produced. Nothing to ship.");
    continue;
  }

  // -------------------------------------------------------------------------
  // Phase 3: Ship
  //
  // PRs are merged one at a time so each is checked against the main it will
  // actually land on: before merging, the PR branch is updated with main and
  // CI runs again. If that update conflicts or CI goes red, a sonnet agent
  // fixes the branch, the host pushes it, and CI runs again.
  //
  // Merging with "Closes #N" in the PR body closes the issue.
  // -------------------------------------------------------------------------
  for (const { issue, result } of completed) {
    let pr: number;
    try {
      pr = openPullRequest(
        issue,
        prTitle(result.stdout, issue.branch, issue.title),
      );
    } catch (err) {
      console.error(`  ✗ ${issue.id}: could not open PR: ${err}`);
      continue;
    }
    console.log(`\n#${pr} (${issue.branch}): waiting for CI…`);

    let merged = false;
    for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      const mergeable =
        shOk("gh", ["pr", "update-branch", `${pr}`]) &&
        (await waitForChecks(pr)) &&
        shOk("gh", ["pr", "merge", `${pr}`, "--squash"], true);
      if (mergeable) {
        merged = true;
        break;
      }
      if (attempt === MAX_FIX_ATTEMPTS) break;

      console.log(`#${pr}: conflicts or failing CI, running fixer…`);
      try {
        const fix = await withCreateRetry(issue.branch, () =>
          sandcastle.run({
          hooks,
          copyToWorktree,
          sandbox: podman(),
          branchStrategy: { type: "branch", branch: issue.branch },
          name: "fixer",
          maxIterations: 10,
          // Sonnet is sufficient for conflict resolution and CI fixes.
          agent: sandcastle.claudeCode("claude-sonnet-5-5"),
          promptFile: "./.sandcastle/fix-prompt.md",
          promptArgs: {
            PR_NUMBER: `${pr}`,
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
          }),
        );
        if (fix.commits.length === 0) break;
        sh("git", ["push", "origin", issue.branch]);
      } catch (err) {
        console.error(`  ✗ ${issue.id}: fixer failed: ${redact(err)}`);
        break;
      }
    }

    if (merged) {
      console.log(`  ✓ #${pr} merged, closes #${issue.id}`);
      pullBase();
      // The local branch may still be checked out in a worktree; best effort.
      shOk("git", ["branch", "-D", issue.branch]);
      shOk("git", ["push", "origin", "--delete", issue.branch]);
    } else {
      console.error(`  ✗ #${pr} left open for review (issue #${issue.id})`);
    }
  }

  console.log("\nPull requests shipped.");
}

console.log("\nAll done.");
