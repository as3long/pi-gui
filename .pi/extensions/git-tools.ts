/**
 * Git Extension for pi-gui
 *
 * Provides comprehensive git integration for pi-coding-agent.
 * Works seamlessly with pi-gui's extension dialog system.
 *
 * Features:
 * - Git status, diff, log, branch, commit, add, pull/push, stash, checkout
 * - Interactive commands (/git-status, /git-log, /git-diff, /git-branch, /git-pull)
 * - Smart commit flow with staged/unstaged awareness
 * - Auto-fetch after each agent turn (configurable)
 * - Automatic checkpoint stashing for session forking
 *
 * Usage:
 *   Place in ~/.pi/agent/extensions/git-tools.ts
 *   Or use with pi: pi -e ./git-tools.ts
 */

import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

// ── Helper: Run git commands ──

interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
  ok: boolean;
}

async function git(
  pi: ExtensionAPI,
  args: string[],
  options?: { timeout?: number },
): Promise<GitResult> {
  const result = await pi.exec("git", args, { timeout: options?.timeout ?? 30_000 });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: result.code ?? 0,
    ok: (result.code ?? 0) === 0,
  };
}

async function isGitRepo(pi: ExtensionAPI): Promise<boolean> {
  const result = await git(pi, ["rev-parse", "--git-dir"]);
  return result.ok;
}

async function getCurrentBranch(pi: ExtensionAPI): Promise<string> {
  const result = await git(pi, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return result.stdout.trim() || "HEAD";
}

async function hasUncommittedChanges(pi: ExtensionAPI): Promise<boolean> {
  const result = await git(pi, ["status", "--porcelain"]);
  return result.stdout.trim().length > 0;
}

async function getStagedFiles(pi: ExtensionAPI): Promise<string[]> {
  const result = await git(pi, ["diff", "--cached", "--name-only"]);
  return result.stdout.trim() ? result.stdout.trim().split("\n") : [];
}

async function getUnstagedFiles(pi: ExtensionAPI): Promise<string[]> {
  const result = await git(pi, ["diff", "--name-only"]);
  return result.stdout.trim() ? result.stdout.trim().split("\n") : [];
}

async function getUntrackedFiles(pi: ExtensionAPI): Promise<string[]> {
  const result = await git(pi, ["ls-files", "--others", "--exclude-standard"]);
  return result.stdout.trim() ? result.stdout.trim().split("\n") : [];
}

// Format full status output
async function formatStatus(pi: ExtensionAPI): Promise<string> {
  const branch = await getCurrentBranch(pi);
  const hasChanges = await hasUncommittedChanges(pi);

  const staged = await getStagedFiles(pi);
  const unstaged = await getUnstagedFiles(pi);
  const untracked = await getUntrackedFiles(pi);

  const lines: string[] = [];
  lines.push(`## On branch: \`${branch}\``);
  lines.push("");

  if (!hasChanges) {
    lines.push("✅ Working tree clean");
    return lines.join("\n");
  }

  if (staged.length > 0) {
    lines.push(`### 📦 Staged changes (${staged.length})`);
    for (const f of staged) lines.push(`  - \`${f}\``);
    lines.push("");
  }

  if (unstaged.length > 0) {
    lines.push(`### 📝 Unstaged changes (${unstaged.length})`);
    for (const f of unstaged) lines.push(`  - \`${f}\``);
    lines.push("");
  }

  if (untracked.length > 0) {
    lines.push(`### 🆕 Untracked files (${untracked.length})`);
    for (const f of untracked) lines.push(`  - \`${f}\``);
    lines.push("");
  }

  return lines.join("\n");
}

// ── Tool parameter schemas ──

const StatusParams = Type.Object({});
type StatusInput = Static<typeof StatusParams>;

const DiffParams = Type.Object({
  target: Type.Optional(
    Type.Union(
      [
        Type.Literal("unstaged"),
        Type.Literal("staged"),
        Type.Literal("working-copy"),
      ],
      {
        description: "What to diff: unstaged (default), staged, or full working copy",
      },
    ),
  ),
  path: Type.Optional(
    Type.String({ description: "Optional file path to restrict diff to" }),
  ),
  cached: Type.Optional(
    Type.Boolean({ description: "Show staged diff (equivalent to target: staged)" }),
  ),
});
type DiffInput = Static<typeof DiffParams>;

const LogParams = Type.Object({
  count: Type.Optional(
    Type.Number({ description: "Number of commits to show (default: 10)", default: 10 }),
  ),
  branch: Type.Optional(
    Type.String({ description: "Branch to show log for (default: current branch)" }),
  ),
  format: Type.Optional(
    Type.Union(
      [Type.Literal("short"), Type.Literal("detailed"), Type.Literal("oneline")],
      { description: "Output format", default: "short" },
    ),
  ),
  path: Type.Optional(
    Type.String({ description: "Filter by file path" }),
  ),
});
type LogInput = Static<typeof LogParams>;

const BranchParams = Type.Object({
  action: Type.Optional(
    Type.Union(
      [
        Type.Literal("list"),
        Type.Literal("create"),
        Type.Literal("delete"),
        Type.Literal("switch"),
      ],
      { description: "Branch operation (default: list)" },
    ),
  ),
  name: Type.Optional(
    Type.String({ description: "Branch name for create/delete/switch" }),
  ),
  startPoint: Type.Optional(
    Type.String({ description: "Start point for creating a new branch" }),
  ),
});
type BranchInput = Static<typeof BranchParams>;

const CommitParams = Type.Object({
  message: Type.String({ description: "Commit message" }),
  all: Type.Optional(
    Type.Boolean({ description: "Auto-stage all tracked files (-a)", default: false }),
  ),
  amend: Type.Optional(
    Type.Boolean({ description: "Amend last commit", default: false }),
  ),
});
type CommitInput = Static<typeof CommitParams>;

const AddParams = Type.Object({
  files: Type.Union(
    [
      Type.String({ description: "File path or '.' to stage all" }),
      Type.Array(Type.String()),
    ],
    { description: "File(s) to stage. Use '.' or '*' for all changed files" },
  ),
  interactive: Type.Optional(
    Type.Boolean({ description: "Interactively select hunks to stage (-p)", default: false }),
  ),
});
type AddInput = Static<typeof AddParams>;

const PushPullParams = Type.Object({
  action: Type.Union(
    [Type.Literal("push"), Type.Literal("pull"), Type.Literal("fetch")],
    { description: "Operation to perform" },
  ),
  remote: Type.Optional(
    Type.String({ description: "Remote name (default: origin)" }),
  ),
  branch: Type.Optional(
    Type.String({ description: "Branch name (default: current branch)" }),
  ),
  force: Type.Optional(
    Type.Boolean({ description: "Force push (use with caution!)", default: false }),
  ),
  rebase: Type.Optional(
    Type.Boolean({ description: "Rebase when pulling instead of merge", default: false }),
  ),
});
type PushPullInput = Static<typeof PushPullParams>;

const StashParams = Type.Object({
  action: Type.Union(
    [Type.Literal("list"), Type.Literal("push"), Type.Literal("pop"), Type.Literal("apply"), Type.Literal("drop")],
    { description: "Stash operation" },
  ),
  message: Type.Optional(
    Type.String({ description: "Stash message (for push)" }),
  ),
  index: Type.Optional(
    Type.Number({ description: "Stash index (for pop/apply/drop, 0 = newest)" }),
  ),
  includeUntracked: Type.Optional(
    Type.Boolean({ description: "Include untracked files (for push)", default: false }),
  ),
});
type StashInput = Static<typeof StashParams>;

const CheckoutParams = Type.Object({
  target: Type.String({ description: "Branch name, commit hash, or file path to checkout" }),
  createBranch: Type.Optional(
    Type.String({ description: "Create and switch to a new branch" }),
  ),
});
type CheckoutInput = Static<typeof CheckoutParams>;

const MergeParams = Type.Object({
  source: Type.String({ description: "Source branch or commit to merge into current branch" }),
  noFastForward: Type.Optional(
    Type.Boolean({ description: "Create merge commit even when fast-forward is possible", default: true }),
  ),
});
type MergeInput = Static<typeof MergeParams>;

// ── Tool ──

/** Tool: git_status */
const gitStatusTool = {
  name: "git_status",
  label: "Git Status",
  description: "Show the working tree status — staged, unstaged, and untracked files",
  promptSnippet: "Show current git working tree status",
  promptGuidelines: [
    "Use git_status before making changes to understand the current repo state",
    "Use git_status before commit to verify what will be committed",
  ],
  parameters: StatusParams,
  async execute(_toolCallId: string, _params: StatusInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return {
        content: [{ type: "text", text: "Not a git repository." }],
        details: {},
      };
    }
    const status = await formatStatus(ctx as unknown as ExtensionAPI);
    return {
      content: [{ type: "text", text: status }],
      details: { branch: await getCurrentBranch(ctx as unknown as ExtensionAPI) },
    };
  },
};

/** Tool: git_diff */
const gitDiffTool = {
  name: "git_diff",
  label: "Git Diff",
  description: "Show differences between working tree, staged, and committed versions",
  promptSnippet: "Show git diff (unstaged/staged changes)",
  promptGuidelines: [
    "Use git_diff to review changes before staging or committing",
    "Use git_diff with cached:true to review staged changes before committing",
  ],
  parameters: DiffParams,
  async execute(_toolCallId: string, params: DiffInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return {
        content: [{ type: "text", text: "Not a git repository." }],
        details: {},
      };
    }

    const pi = ctx as unknown as ExtensionAPI;
    const args = ["diff"];

    // Determine what to diff
    if (params.cached || params.target === "staged") {
      args.push("--cached");
    } else if (params.target === "working-copy") {
      // Full diff of working copy vs HEAD
      args.push("HEAD");
    }
    // default: unstaged diff

    if (params.path) {
      args.push("--", params.path);
    }

    const result = await git(pi, args);
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `Git diff failed:\n\`\`\`\n${result.stderr.trim()}\n\`\`\`` }],
        details: { isError: true },
      };
    }

    const output = result.stdout;
    if (!output.trim()) {
      return {
        content: [{ type: "text", text: "No differences found." }],
        details: {},
      };
    }

    // Truncate very large diffs
    const maxLen = 50000;
    const displayText = output.length > maxLen
      ? output.slice(0, maxLen) + `\n\n... (truncated, ${output.length - maxLen} more bytes)`
      : output;

    return {
      content: [{ type: "text", text: `\`\`\`diff\n${displayText}\n\`\`\`` }],
      details: { bytes: output.length },
    };
  },
};

/** Tool: git_log */
const gitLogTool = {
  name: "git_log",
  label: "Git Log",
  description: "Show commit history with optional formatting",
  promptSnippet: "Show git commit log",
  promptGuidelines: [
    "Use git_log to understand recent changes, find commit hashes, or review project history",
  ],
  parameters: LogParams,
  async execute(_toolCallId: string, params: LogInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return {
        content: [{ type: "text", text: "Not a git repository." }],
        details: {},
      };
    }

    const pi = ctx as unknown as ExtensionAPI;
    const count = Math.min(params.count ?? 10, 100);
    const args = ["log", `--max-count=${count}`];

    if (params.format === "oneline") {
      args.push("--oneline");
    } else if (params.format === "detailed") {
      args.push("--stat", "--patch");
    } else {
      // short (default): pretty format with hash, author, date, subject
      args.push("--pretty=format:%C(yellow)%h%Creset %C(cyan)%an%Creset %C(green)%ar%Creset%n  %s");
    }

    if (params.branch) args.push(params.branch);
    if (params.path) args.push("--", params.path);

    const result = await git(pi, args);
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `Git log failed:\n\`\`\`\n${result.stderr.trim()}\n\`\`\`` }],
        details: { isError: true },
      };
    }

    const output = result.stdout.trim();
    if (!output) {
      return {
        content: [{ type: "text", text: "No commits found." }],
        details: {},
      };
    }

    return {
      content: [{ type: "text", text: `\`\`\`\n${output}\n\`\`\`` }],
      details: { count: output.split("\n").length },
    };
  },
};

/** Tool: git_branch */
const gitBranchTool = {
  name: "git_branch",
  label: "Git Branch",
  description: "List, create, delete, or switch branches",
  promptSnippet: "Manage git branches (list, create, delete, switch)",
  promptGuidelines: [
    "Use git_branch to list branches, create new branches, or switch between branches",
  ],
  parameters: BranchParams,
  async execute(_toolCallId: string, params: BranchInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return {
        content: [{ type: "text", text: "Not a git repository." }],
        details: {},
      };
    }

    const pi = ctx as unknown as ExtensionAPI;
    const action = params.action ?? "list";

    switch (action) {
      case "list": {
        const result = await git(pi, ["branch", "-a"]);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Failed to list branches:\n${result.stderr}` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: `\`\`\`\n${result.stdout}\n\`\`\`` }], details: {} };
      }

      case "create": {
        if (!params.name) {
          return { content: [{ type: "text", text: "Branch name is required." }], details: { isError: true } };
        }
        const createArgs = ["branch", params.name];
        if (params.startPoint) createArgs.push(params.startPoint);
        const result = await git(pi, createArgs);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Failed to create branch:\n${result.stderr}` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: `✅ Created branch \`${params.name}\`${params.startPoint ? ` at \`${params.startPoint}\`` : ""}` }], details: {} };
      }

      case "delete": {
        if (!params.name) {
          return { content: [{ type: "text", text: "Branch name is required." }], details: { isError: true } };
        }
        const result = await git(pi, ["branch", "-D", params.name]);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Failed to delete branch:\n${result.stderr}` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: `✅ Deleted branch \`${params.name}\`` }], details: {} };
      }

      case "switch": {
        if (!params.name) {
          return { content: [{ type: "text", text: "Branch name is required." }], details: { isError: true } };
        }
        // Check for uncommitted changes before switching
        const dirty = await hasUncommittedChanges(pi);
        if (dirty) {
          return {
            content: [{
              type: "text",
              text: `⚠️ You have uncommitted changes. Please commit, stash, or discard them before switching branches.\n\nUse \`git stash push -m "temp"\` to save work, or commit first.`,
            }],
            details: { isError: true },
          };
        }
        const result = await git(pi, ["checkout", params.name]);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Failed to switch:\n${result.stderr}` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: `✅ Switched to branch \`${params.name}\`` }], details: { branch: params.name } };
      }

      default:
        return { content: [{ type: "text", text: `Unknown action: ${action}` }], details: { isError: true } };
    }
  },
};

/** Tool: git_commit */
const gitCommitTool = {
  name: "git_commit",
  label: "Git Commit",
  description: "Commit staged changes with a message",
  promptSnippet: "Commit staged changes with a message",
  promptGuidelines: [
    "Use git_commit when the user asks to commit changes",
    "Check git_status first to see what will be committed",
    "Use all:true to auto-stage tracked files before committing (equivalent to git commit -a)",
  ],
  parameters: CommitParams,
  async execute(_toolCallId: string, params: CommitInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return {
        content: [{ type: "text", text: "Not a git repository." }],
        details: {},
      };
    }

    const pi = ctx as unknown as ExtensionAPI;
    const args = ["commit"];

    if (params.amend) args.push("--amend");
    if (params.all) args.push("-a");
    args.push("-m", params.message);

    // Validate: if not -a and not amend, check there are staged files
    if (!params.all && !params.amend) {
      const staged = await getStagedFiles(pi);
      if (staged.length === 0) {
        return {
          content: [{
            type: "text",
            text: "⚠️ Nothing staged to commit. Stage files first with `git add` or use `all: true` to auto-stage tracked changes.",
          }],
          details: { isError: true },
        };
      }
    }

    const result = await git(pi, args);
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `Commit failed:\n\`\`\`\n${result.stderr.trim()}\n\`\`\`` }],
        details: { isError: true },
      };
    }

    const output = result.stdout.trim();
    return {
      content: [{ type: "text", text: `✅ Commit successful\n\n\`\`\`\n${output}\n\`\`\`` }],
      details: { message: params.message, amend: !!params.amend },
    };
  },
};

/** Tool: git_add */
const gitAddTool = {
  name: "git_add",
  label: "Git Add",
  description: "Stage file(s) for commit, or use '.' to stage all changes",
  promptSnippet: "Stage files for commit",
  promptGuidelines: [
    "Use git_add to stage specific files or all changes before committing",
    "Use '.' to stage all changed files",
  ],
  parameters: AddParams,
  async execute(_toolCallId: string, params: AddInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return {
        content: [{ type: "text", text: "Not a git repository." }],
        details: {},
      };
    }

    const pi = ctx as unknown as ExtensionAPI;

    // Determine files to stage
    const files = typeof params.files === "string" ? [params.files] : params.files;
    const args = params.interactive ? ["add", "-p"] : ["add"];
    args.push(...files);

    const result = await git(pi, args, { timeout: 60_000 });
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `Failed to stage files:\n\`\`\`\n${result.stderr.trim()}\n\`\`\`` }],
        details: { isError: true },
      };
    }

    return {
      content: [{ type: "text", text: `✅ Staged: ${files.join(", ")}` }],
      details: { files },
    };
  },
};

/** Tool: git_push_pull */
const gitPushPullTool = {
  name: "git_push_pull",
  label: "Git Push/Pull/Fetch",
  description: "Push, pull, or fetch from remote repository",
  promptSnippet: "Sync with remote (push, pull, or fetch)",
  promptGuidelines: [
    "Use git_push_pull to synchronize with remote repositories",
    "Always pull before pushing to avoid conflicts",
    "Use force:true only when you're sure (rewrites history!)",
  ],
  parameters: PushPullParams,
  async execute(_toolCallId: string, params: PushPullInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return {
        content: [{ type: "text", text: "Not a git repository." }],
        details: {},
      };
    }

    const pi = ctx as unknown as ExtensionAPI;
    const remote = params.remote || "origin";
    const branch = params.branch || (await getCurrentBranch(pi));

    switch (params.action) {
      case "fetch": {
        ctx.ui?.notify(`Fetching from ${remote}...`, "info");
        const result = await git(pi, ["fetch", remote], { timeout: 120_000 });
        if (!result.ok) {
          return { content: [{ type: "text", text: `Fetch failed:\n${result.stderr}` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: `✅ Fetched from \`${remote}\`` }], details: {} };
      }

      case "pull": {
        ctx.ui?.notify(`Pulling from ${remote}/${branch}...`, "info");
        const args = ["pull", remote, branch];
        if (params.rebase) args.push("--rebase");
        const result = await git(pi, args, { timeout: 120_000 });
        if (!result.ok) {
          return { content: [{ type: "text", text: `Pull failed:\n\`\`\`\n${result.stderr.trim()}\n\`\`\`` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: `✅ Pulled from \`${remote}/${branch}\`\n\n\`\`\`\n${result.stdout.trim()}\n\`\`\`` }], details: {} };
      }

      case "push": {
        // Warn about force push
        if (params.force && ctx.hasUI) {
          const ok = await ctx.ui.confirm("⚠️ Force Push", `Force push to ${remote}/${branch}? This rewrites history!`);
          if (!ok) {
            return { content: [{ type: "text", text: "Force push cancelled." }], details: {} };
          }
        }

        ctx.ui?.notify(`Pushing to ${remote}/${branch}...`, "info");
        const args = ["push", remote, branch];
        if (params.force) args.push("--force");
        const result = await git(pi, args, { timeout: 120_000 });
        if (!result.ok) {
          return { content: [{ type: "text", text: `Push failed:\n\`\`\`\n${result.stderr.trim()}\n\`\`\`` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: `✅ Pushed to \`${remote}/${branch}\`\n\n\`\`\`\n${result.stdout.trim()}\n\`\`\`` }], details: {} };
      }

      default:
        return { content: [{ type: "text", text: `Unknown action: ${params.action}` }], details: { isError: true } };
    }
  },
};

/** Tool: git_stash */
const gitStashTool = {
  name: "git_stash",
  label: "Git Stash",
  description: "Stash and unstash changes",
  promptSnippet: "Manage git stash (save/restore work-in-progress)",
  promptGuidelines: [
    "Use git_stash (push) when you need to temporarily save work and clean the working tree",
    "Use git_stash (pop) to restore the most recent stash",
  ],
  parameters: StashParams,
  async execute(_toolCallId: string, params: StashInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return {
        content: [{ type: "text", text: "Not a git repository." }],
        details: {},
      };
    }

    const pi = ctx as unknown as ExtensionAPI;

    switch (params.action) {
      case "list": {
        const result = await git(pi, ["stash", "list"]);
        const output = result.stdout.trim() || "No stashes found.";
        return { content: [{ type: "text", text: `\`\`\`\n${output}\n\`\`\`` }], details: {} };
      }

      case "push": {
        const args = ["stash", "push"];
        if (params.message) args.push("-m", params.message);
        if (params.includeUntracked) args.push("--include-untracked");
        const result = await git(pi, args);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Stash failed:\n${result.stderr}` }], details: { isError: true } };
        }
        const msg = params.message ? `"${params.message}"` : "";
        return { content: [{ type: "text", text: `✅ Changes stashed ${msg}` }], details: {} };
      }

      case "pop": {
        const args = ["stash", "pop"];
        if (params.index !== undefined) args.push(`stash@{${params.index}}`);
        const result = await git(pi, args);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Failed to pop stash:\n${result.stderr}` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: `✅ Stash restored\n\n\`\`\`\n${result.stdout.trim()}\n\`\`\`` }], details: {} };
      }

      case "apply": {
        const args = ["stash", "apply"];
        if (params.index !== undefined) args.push(`stash@{${params.index}}`);
        const result = await git(pi, args);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Failed to apply stash:\n${result.stderr}` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: `✅ Stash applied\n\n\`\`\`\n${result.stdout.trim()}\n\`\`\`` }], details: {} };
      }

      case "drop": {
        const args = ["stash", "drop"];
        if (params.index !== undefined) args.push(`stash@{${params.index}}`);
        const result = await git(pi, args);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Failed to drop stash:\n${result.stderr}` }], details: { isError: true } };
        }
        return { content: [{ type: "text", text: "✅ Stash dropped" }], details: {} };
      }

      default:
        return { content: [{ type: "text", text: `Unknown action: ${params.action}` }], details: { isError: true } };
    }
  },
};

/** Tool: git_checkout */
const gitCheckoutTool = {
  name: "git_checkout",
  label: "Git Checkout",
  description: "Checkout a branch, commit, or file",
  promptSnippet: "Switch branches or restore files",
  promptGuidelines: [
    "Use git_checkout to switch branches (by name or commit hash)",
    "Use git_checkout with createBranch to create and switch to a new branch",
  ],
  parameters: CheckoutParams,
  async execute(_toolCallId: string, params: CheckoutInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return {
        content: [{ type: "text", text: "Not a git repository." }],
        details: {},
      };
    }

    const pi = ctx as unknown as ExtensionAPI;
    const args = ["checkout"];

    if (params.createBranch) {
      args.push("-b", params.createBranch);
    }

    args.push(params.target);

    // Check for uncommitted changes before switching branches
    if (!params.target.includes("/") && !params.createBranch) {
      // It might be a branch name — check for dirty tree
      const result = await git(pi, ["rev-parse", "--verify", params.target]);
      if (result.ok) {
        // It's a valid ref
        const dirty = await hasUncommittedChanges(pi);
        if (dirty && ctx.hasUI) {
          const ok = await ctx.ui.confirm(
            "Uncommitted Changes",
            "You have uncommitted changes. Proceed with checkout anyway? (They will be preserved if not conflicting.)",
          );
          if (!ok) {
            return { content: [{ type: "text", text: "Checkout cancelled. Commit or stash your changes first." }], details: {} };
          }
        }
      }
    }

    const result = await git(pi, args);
    if (!result.ok) {
      return { content: [{ type: "text", text: `Checkout failed:\n\`\`\`\n${result.stderr.trim()}\n\`\`\`` }], details: { isError: true } };
    }

    const output = result.stdout.trim();
    return { content: [{ type: "text", text: `✅ ${output || `Checked out \`${params.target}\``}` }], details: { target: params.target } };
  },
};

/** Tool: git_merge */
const gitMergeTool = {
  name: "git_merge",
  label: "Git Merge",
  description: "Merge a branch or commit into the current branch",
  promptSnippet: "Merge changes from another branch into the current branch",
  promptGuidelines: [
    "Use git_merge to integrate changes from another branch",
    "Check git_status first to ensure the working tree is clean before merging",
  ],
  parameters: MergeParams,
  async execute(_toolCallId: string, params: MergeInput, _signal: AbortSignal, _onUpdate: unknown, ctx: ExtensionContext) {
    if (!(await isGitRepo(ctx as unknown as ExtensionAPI))) {
      return { content: [{ type: "text", text: "Not a git repository." }], details: {} };
    }

    const pi = ctx as unknown as ExtensionAPI;

    // Check for uncommitted changes
    const dirty = await hasUncommittedChanges(pi);
    if (dirty) {
      return {
        content: [{ type: "text", text: "⚠️ Working tree is dirty. Commit or stash changes before merging." }],
        details: { isError: true },
      };
    }

    const args = ["merge"];
    if (params.noFastForward !== false) args.push("--no-ff");
    args.push(params.source);

    const result = await git(pi, args, { timeout: 60_000 });
    if (!result.ok) {
      const stderr = result.stderr.trim();
      // Check for merge conflicts
      if (stderr.includes("conflict") || stderr.includes("CONFLICT")) {
        return {
          content: [{
            type: "text",
            text: `⚠️ Merge conflicts detected when merging \`${params.source}\`:\n\n\`\`\`\n${stderr}\n\`\`\`\n\nResolve conflicts, stage the resolved files, then commit.`,
          }],
          details: { conflicts: true },
        };
      }
      return {
        content: [{ type: "text", text: `Merge failed:\n\`\`\`\n${stderr}\n\`\`\`` }],
        details: { isError: true },
      };
    }

    return {
      content: [{ type: "text", text: `✅ Merged \`${params.source}\`\n\n\`\`\`\n${result.stdout.trim()}\n\`\`\`` }],
      details: {},
    };
  },
};

// ── Extension Entry Point ──

export default function (pi: ExtensionAPI) {
  // ── Register all git tools ──

  pi.registerTool(gitStatusTool);
  pi.registerTool(gitDiffTool);
  pi.registerTool(gitLogTool);
  pi.registerTool(gitBranchTool);
  pi.registerTool(gitCommitTool);
  pi.registerTool(gitAddTool);
  pi.registerTool(gitPushPullTool);
  pi.registerTool(gitStashTool);
  pi.registerTool(gitCheckoutTool);
  pi.registerTool(gitMergeTool);

  // ── Register interactive commands ──

  // /git-status
  pi.registerCommand("git-status", {
    description: "Show git working tree status",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        await ctx.withSession(async (freshCtx) => {
          if (!(await isGitRepo(freshCtx))) {
            ctx.ui.notify("Not a git repository", "error");
            return;
          }
          const status = await formatStatus(freshCtx);
          ctx.ui.notify(status, "info");
        });
      } catch (e) {
        ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  // /git-log
  pi.registerCommand("git-log", {
    description: "Show recent git commits. Usage: /git-log [count=10]",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        await ctx.withSession(async (freshCtx) => {
          if (!(await isGitRepo(freshCtx))) {
            ctx.ui.notify("Not a git repository", "error");
            return;
          }
          const count = parseInt(args, 10) || 10;
          const result = await git(freshCtx, [
            "log", `--max-count=${Math.min(count, 50)}`,
            "--pretty=format:%C(yellow)%h%Creset %C(cyan)%an%Creset %C(green)%ar%Creset%n  %s",
          ]);
          if (!result.ok) {
            ctx.ui.notify(`Git log failed: ${result.stderr}`, "error");
            return;
          }
          ctx.ui.notify(`\`\`\`\n${result.stdout.trim()}\n\`\`\``, "info");
        });
      } catch (e) {
        ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  // /git-diff
  pi.registerCommand("git-diff", {
    description: "Show git diff (unstaged changes). Usage: /git-diff [--staged|--cached] [path]",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        await ctx.withSession(async (freshCtx) => {
          if (!(await isGitRepo(freshCtx))) {
            ctx.ui.notify("Not a git repository", "error");
            return;
          }
          const parts = args.split(/\s+/).filter(Boolean);
          const gitArgs = ["diff"];
          for (const part of parts) {
            if (part === "--staged" || part === "--cached") {
              gitArgs.push("--cached");
            } else {
              gitArgs.push("--", part);
            }
          }
          const result = await git(freshCtx, gitArgs);
          if (!result.ok) {
            ctx.ui.notify(`Git diff failed: ${result.stderr}`, "error");
            return;
          }
          const output = result.stdout.trim();
          if (!output) {
            ctx.ui.notify("No differences found.", "info");
            return;
          }
          // truncate for notification display
          const display = output.length > 5000 ? output.slice(0, 5000) + "\n... (truncated)" : output;
          ctx.ui.notify(`\`\`\`diff\n${display}\n\`\`\``, "info");
        });
      } catch (e) {
        ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  // /git-branch
  pi.registerCommand("git-branch", {
    description: "List git branches. Usage: /git-branch [-a]",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        await ctx.withSession(async (freshCtx) => {
          if (!(await isGitRepo(freshCtx))) {
            ctx.ui.notify("Not a git repository", "error");
            return;
          }
          const allFlag = args.trim() === "-a";
          const gitArgs = ["branch"];
          if (allFlag) gitArgs.push("-a");
          const result = await git(freshCtx, gitArgs);
          if (!result.ok) {
            ctx.ui.notify(`Failed to list branches: ${result.stderr}`, "error");
            return;
          }
          ctx.ui.notify(`\`\`\`\n${result.stdout.trim()}\n\`\`\``, "info");
        });
      } catch (e) {
        ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  // /git-pull
  pi.registerCommand("git-pull", {
    description: "Pull from remote. Usage: /git-pull [remote] [branch]",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        await ctx.withSession(async (freshCtx) => {
          if (!(await isGitRepo(freshCtx))) {
            ctx.ui.notify("Not a git repository", "error");
            return;
          }
          const parts = args.split(/\s+/).filter(Boolean);
          const remote = parts[0] || "origin";
          const branch = parts[1] || (await getCurrentBranch(freshCtx));
          ctx.ui.notify(`Pulling from ${remote}/${branch}...`, "info");
          const result = await git(freshCtx, ["pull", remote, branch], { timeout: 120_000 });
          if (!result.ok) {
            ctx.ui.notify(`Pull failed: ${result.stderr}`, "error");
            return;
          }
          ctx.ui.notify(result.stdout.trim() || "Already up to date.", "info");
        });
      } catch (e) {
        ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  // /git-commit — interactive commit via UI dialog
  pi.registerCommand("git-commit", {
    description: "Interactively commit staged changes. Usage: /git-commit [message]",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        await ctx.withSession(async (freshCtx) => {
          if (!(await isGitRepo(freshCtx))) {
            ctx.ui.notify("Not a git repository", "error");
            return;
          }

          if (args.trim()) {
            // Direct commit with message from args
            const result = await git(freshCtx, ["commit", "-m", args.trim()]);
            if (!result.ok) {
              ctx.ui.notify(`Commit failed: ${result.stderr}`, "error");
              return;
            }
            ctx.ui.notify(`✅ ${result.stdout.trim()}`, "info");
            return;
          }

          // Interactive: prompt for message via UI
          const staged = await getStagedFiles(freshCtx);
          if (staged.length === 0) {
            ctx.ui.notify("Nothing staged. Stage files first with /git-add or use git_add tool.", "warning");
            return;
          }

          const msg = await ctx.ui.input("Commit Message", {
            placeholder: "Enter commit message...",
          });

          if (!msg) {
            ctx.ui.notify("Commit cancelled.", "info");
            return;
          }

          const result = await git(freshCtx, ["commit", "-m", msg]);
          if (!result.ok) {
            ctx.ui.notify(`Commit failed: ${result.stderr}`, "error");
            return;
          }
          ctx.ui.notify(`✅ ${result.stdout.trim()}`, "info");
        });
      } catch (e) {
        ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  // /git-add — interactive file staging
  pi.registerCommand("git-add", {
    description: "Stage files interactively. Usage: /git-add <file...> or '.' for all",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        await ctx.withSession(async (freshCtx) => {
          if (!(await isGitRepo(freshCtx))) {
            ctx.ui.notify("Not a git repository", "error");
            return;
          }

          const files = args.trim();
          if (!files) {
            // Show files that can be staged
            const unstaged = await getUnstagedFiles(freshCtx);
            const untracked = await getUntrackedFiles(freshCtx);
            const all = [...unstaged, ...untracked];
            if (all.length === 0) {
              ctx.ui.notify("No files to stage.", "info");
              return;
            }
            ctx.ui.notify(
              `Available to stage:\n${all.map((f) => `  - ${f}`).join("\n")}\n\nUse: /git-add <file> or /git-add .`,
              "info",
            );
            return;
          }

          const filesToStage = files === "." ? ["."] : files.split(/\s+/);
          const result = await git(freshCtx, ["add", ...filesToStage]);
          if (!result.ok) {
            ctx.ui.notify(`Stage failed: ${result.stderr}`, "error");
            return;
          }
          ctx.ui.notify(`✅ Staged: ${filesToStage.join(", ")}`, "info");
        });
      } catch (e) {
        ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  // ── Auto-checkpoint on fork ──

  const checkpoints = new Map<string, string>();

  pi.on("tool_result", async (_event: any, ctx: ExtensionContext) => {
    const leaf = ctx.sessionManager.getLeafEntry();
    if (leaf) {
      const id = leaf.id;
      if (id && !checkpoints.has(id)) {
        // Defer checkpoint creation to not slow down tool execution
        setTimeout(async () => {
          try {
            // Use ctx.withSession to get a fresh active context instead of stale pi reference
            await ctx.withSession(async (freshCtx) => {
              const { stdout } = await freshCtx.exec("git", ["stash", "create"], { timeout: 15_000 });
              const ref = stdout.trim();
              if (ref) checkpoints.set(id, ref);
            });
          } catch {
            // Session might have been replaced — silently ignore
          }
        }, 0);
      }
    }
  });

  pi.on("session_before_fork", async (event: any, ctx: ExtensionContext) => {
    const ref = checkpoints.get(event.entryId);
    if (!ref) return;
    if (!ctx.hasUI) return;

    const choice = await ctx.ui.select("Restore code state for this fork point?", [
      "Yes, restore code to this checkpoint",
      "No, keep current working tree",
    ]);

    if (choice?.startsWith("Yes")) {
      try {
        await ctx.withSession(async (freshCtx) => {
          await freshCtx.exec("git", ["stash", "apply", ref]);
          ctx.ui.notify("✅ Code restored to fork checkpoint", "info");
        });
      } catch {
        // Session might have been replaced — silently ignore
      }
    }
  });

  // ── Status bar (non-blocking: defer to avoid startup delay) ──

  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    // Defer git info load — don't block pi startup
    setTimeout(async () => {
      try {
        await ctx.withSession(async (freshCtx) => {
          if (!(await isGitRepo(freshCtx))) return;
          const branch = await getCurrentBranch(freshCtx);
          const dirty = await hasUncommittedChanges(freshCtx);
          const icon = dirty ? "⚠️" : "✅";
          ctx.ui.setStatus("git", `${icon} ${branch}`);
        });
      } catch {
        // Session might have been replaced — silently ignore
      }
    }, 0);
  });

  // Notify on session start (deferred)
  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    setTimeout(async () => {
      try {
        await ctx.withSession(async (freshCtx) => {
          if (!(await isGitRepo(freshCtx))) return;
          const branch = await getCurrentBranch(freshCtx);
          ctx.ui.notify(`🐙 Git ready — on branch \`${branch}\``, "info");
        });
      } catch {
        // Session might have been replaced — silently ignore
      }
    }, 0);
  });
}
