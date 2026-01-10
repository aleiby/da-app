---
name: parallel-work
description: Spawn parallel agents to work on all ready issues from bd
---

# Parallel Work Command

Orchestrates parallel execution of multiple ready issues from the beads (bd) issue tracker.

## When Invoked

When the user runs `/parallel-work`:

1. **Fetch available work** - Run `bd ready` to get all issues with no blockers
2. **Parse issue list** - Extract issue IDs and titles from the output
3. **Spawn parallel agents** - Create one Task (general-purpose agent) per issue with these constraints:
   - Agent can ONLY update their assigned issue (`bd update <their-id> ...`, `bd close <their-id>`)
   - Agent must NOT run `bd sync` or `git push/pull`
   - Agent should report any cross-issue changes needed (new issues, dependencies, etc.)
4. **Aggregate results** - Wait for all agents, collect their outputs and cross-issue requests
5. **Process cross-issue changes** - Create any new issues, add dependencies as requested by agents
6. **Land the plane** - Execute the session close protocol:
   - Run quality gates if code changed (tests, linters, builds)
   - Batch close/update issues: `bd close <id1> <id2> ...`
   - Serialize git operations: `git pull --rebase && bd sync && git push`
   - Verify push succeeded: `git status`

## Parallel Agent Instructions

Each spawned agent receives:

```
Work on issue <ISSUE_ID>: <ISSUE_TITLE>

IMPORTANT CONSTRAINTS:
- You may ONLY update your assigned issue: <ISSUE_ID>
- DO NOT run: bd sync, git push, git pull, or update ANY other issues
- DO NOT create new issues directly
- Start by running: bd show <ISSUE_ID> to understand the full requirements
- Update status: bd update <ISSUE_ID> --status in_progress (when starting)
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
- Files changed
- Any cross-issue requests
```

## Example Execution

```
User: /parallel-work

Claude:
Let me check what work is ready...

[Runs bd ready, finds 3 issues: da-app-123, da-app-456, da-app-789]

Spawning 3 parallel agents to work on these issues:
1. da-app-123: Install dependencies
2. da-app-456: Configure Redis
3. da-app-789: Update documentation

[Spawns 3 Task tools in parallel, waits for completion]

All agents completed. Processing results:
- Agent 1: Completed da-app-123 successfully
- Agent 2: Completed da-app-456, requests new issue for "Test Redis connection"
- Agent 3: Completed da-app-789 successfully

Creating requested follow-up issues...
[Runs bd create for new issues]

Landing the plane...
[Runs git pull --rebase && bd sync && git push]

Done! All 3 issues completed and pushed to remote.
```

## Key Rules

1. **All agents spawn in parallel** - Use a single message with multiple Task tool invocations
2. **No git conflicts** - Agents don't touch git or bd sync
3. **Controlled issue updates** - Each agent only updates their assigned issue
4. **Single sync point** - All git/beads operations happen serially at the end
5. **Follow session close protocol** - Always verify `git push` succeeded before declaring done

## Error Handling

If any agent fails or gets blocked:
- Continue with other agents
- Report the failure
- Create blocking issues if needed
- Don't let one failure stop the entire workflow
