---
name: parallel-work
description: Spawn parallel agents to work on all ready issues from bd
---

# Parallel Work Command

Orchestrates parallel execution of multiple ready issues from the beads (bd) issue tracker using git worktrees for isolation.

## When Invoked

When the user runs `/parallel-work`:

1. **Fetch available work** - Run `bd ready` to get all issues with no blockers
2. **Parse issue list** - Extract issue IDs and titles from the output
3. **Setup worktrees** - For each issue, create a git worktree:
   ```bash
   WORKTREE_BASE="/tmp/da-app-worktrees"
   mkdir -p "$WORKTREE_BASE"
   git worktree add "$WORKTREE_BASE/<issue-id>" -b "work/<issue-id>" HEAD
   ```
4. **Spawn parallel agents** - Create one Task (general-purpose agent) per issue with these constraints:
   - Agent works ONLY in their assigned worktree directory
   - Agent can commit to their branch but must NOT push
   - Agent can ONLY update their assigned issue (`bd update <their-id> ...`, `bd close <their-id>`)
   - Agent must NOT run `bd sync` or `git push/pull`
   - Agent should report any cross-issue changes needed (new issues, dependencies, etc.)
5. **Aggregate results** - Wait for all agents, collect their outputs and cross-issue requests
6. **Merge worktrees** - For each completed worktree:
   ```bash
   git merge --no-ff "work/<issue-id>" -m "Merge work/<issue-id>: <issue-title>"
   ```
   Handle merge conflicts if they occur (may need to resolve manually or sequentially)
7. **Process cross-issue changes** - Create any new issues, add dependencies as requested by agents
8. **Cleanup worktrees** - Remove all worktrees:
   ```bash
   git worktree remove "$WORKTREE_BASE/<issue-id>"
   git branch -d "work/<issue-id>"
   ```
9. **Land the plane** - Execute the session close protocol:
   - Run quality gates if code changed (tests, linters, builds)
   - Batch close/update issues: `bd close <id1> <id2> ...`
   - Serialize git operations: `git pull --rebase && bd sync && git push`
   - Verify push succeeded: `git status`

## Parallel Agent Instructions

Each spawned agent receives:

```
Work on issue <ISSUE_ID>: <ISSUE_TITLE>

WORKING DIRECTORY: <WORKTREE_PATH>
You are working in a dedicated git worktree. All file operations must use this path.

IMPORTANT CONSTRAINTS:
- Work ONLY in your worktree: <WORKTREE_PATH>
- You may commit changes to your branch (work/<ISSUE_ID>) but DO NOT push
- You may ONLY update your assigned issue: <ISSUE_ID>
- DO NOT run: bd sync, git push, git pull, or update ANY other issues
- DO NOT create new issues directly
- Start by running: bd show <ISSUE_ID> to understand the full requirements
- Update status: bd update <ISSUE_ID> --status in_progress (when starting)
- When done, commit your changes: git add -A && git commit -m "<descriptive message>"
- Close when done: bd close <ISSUE_ID>

If you need to:
- Create new issues (follow-up work, blockers discovered, etc.)
- Add/remove dependencies
- Update other issues

Report these in your final output using this format:

CROSS_ISSUE_REQUESTS:
- create: {title: "...", type: "task|bug|feature", priority: 0-4, description: "..."}
- dependency: {from: "<issue-id>", dependsOn: "<issue-id>"}
- update: {issue: "<issue-id>", status: "...", reason: "..."}

Your work summary should include:
- What was accomplished
- Any blockers encountered
- Files changed (committed to your branch)
- Any cross-issue requests
```

## Example Execution

```
User: /parallel-work

Claude:
Let me check what work is ready...

[Runs bd ready, finds 3 issues: da-app-123, da-app-456, da-app-789]

Setting up git worktrees for parallel work...
[Creates worktrees at /tmp/da-app-worktrees/da-app-{123,456,789}]

Spawning 3 parallel agents to work on these issues:
1. da-app-123: Install dependencies (worktree: /tmp/da-app-worktrees/da-app-123)
2. da-app-456: Configure Redis (worktree: /tmp/da-app-worktrees/da-app-456)
3. da-app-789: Update documentation (worktree: /tmp/da-app-worktrees/da-app-789)

[Spawns 3 Task tools in parallel, waits for completion]

All agents completed. Merging worktree branches...
- Merged work/da-app-123 (3 files changed)
- Merged work/da-app-456 (2 files changed)
- Merged work/da-app-789 (1 file changed)

Processing cross-issue requests:
- Agent 2 requested new issue: "Test Redis connection"
[Runs bd create for new issues]

Cleaning up worktrees...
[Removes worktrees and deletes branches]

Landing the plane...
[Runs tests, bd close, git pull --rebase && bd sync && git push]

Done! All 3 issues completed and pushed to remote.
```

## Key Rules

1. **Worktree isolation** - Each agent works in its own git worktree with its own branch
2. **All agents spawn in parallel** - Use a single message with multiple Task tool invocations
3. **Commit but don't push** - Agents commit locally; orchestrator merges and pushes
4. **Controlled issue updates** - Each agent only updates their assigned issue
5. **Single merge point** - All branches merged serially at the end to handle conflicts
6. **Single sync point** - All git/beads operations happen serially at the end
7. **Follow session close protocol** - Always verify `git push` succeeded before declaring done

## Merge Conflict Handling

If merge conflicts occur:
1. Attempt automatic merge first
2. If conflict, try merging branches one at a time with conflict resolution
3. If still unresolvable, report conflict and ask user for guidance
4. Track conflicting changes in issue updates

## Error Handling

If any agent fails or gets blocked:
- Continue with other agents
- Report the failure
- Skip merging for failed branches
- Create blocking issues if needed
- Don't let one failure stop the entire workflow

## Cleanup on Failure

Always clean up worktrees, even on failure:
```bash
git worktree list | grep "$WORKTREE_BASE" | awk '{print $1}' | xargs -I{} git worktree remove --force {}
git branch --list 'work/*' | xargs -I{} git branch -D {}
```
