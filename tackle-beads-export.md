# Tackle Skill Beads Export

Exported: 2026-01-30 from ~/gt/.beads (HQ town-level)

---

## hq-qb0k5 [bug] P2

**Tackle: PROJECT-RESEARCH creates duplicate cache beads instead of updating**

The PROJECT-RESEARCH sub-agent should update existing cache beads but sometimes creates duplicates.

Found two cache beads for steveyegge/gastown:
- gt-lzn4qw (2026-01-25)
- gt-mzbwo (2026-01-26)

cache-freshness.sh was finding the older one because it took [0] instead of sorting by updated_at.

Fixed cache-freshness.sh to sort by updated_at, but the sub-agent should also be fixed to:
1. Search for existing cache bead by external-ref or title
2. Update it instead of creating new one

---

## hq-mol-edj [epic] P2

**tackle**

Upstream-aware issue implementation workflow with approval gates.

Tracks work from initial research through PR submission. Each step is a
checkpoint that survives session restarts. Gates require explicit approval.

---

## hq-4cia3 [task] P2

**Tackle skill improvements from beads session analysis**

Analysis of tackle-beads1.log revealed several areas for improvement:

### Pre-Implementation Checklist (IMPLEMENT.md)
- Add: "Search for ALL callers of functions being modified"
- Add: "Identify test data that might be affected by new filters"

### Plan Phase Enhancement (SKILL.md gate-plan)
- Require: "List internal callers that might need IncludeXxx flags"
- Add: "Consider config-driven vs hardcoded approaches for exclusion patterns"

### Validation Phase (VALIDATION.md)
- Add: "If tests required data changes to pass, question if implementation is correct"

### Mid-Flight Pivot Protocol
- Add guidance for when user feedback requires significant redesign
- Checkpoint current state, document what changed and why

### Scope Creep Detection
- The fix evolved from "exclude mol steps" to "config-driven exclusion patterns"
- Need guidance on when to split into multiple PRs

### Root Cause
Agent didn't anticipate that hardcoded -mol- exclusion would break internal callers like findGateReadyMolecules. The right design (IncludeMolSteps filter field + config-driven patterns) emerged only after user prompting.

Source: /tmp/tackle-beads1.log

### Notes

#### Additional Findings: Compaction Recovery Problem

Research from Holden (hq-axdl9)

Root cause is Claude Code bugs, not Gas Town design:

1. **PreCompact hook may not fire** (Claude Code Issue #13572)
2. **No PostCompact hook exists** (requested in #17237, #14258)
3. **SessionStart may not fire after compaction** - same session, just truncated

The Gas Town design is correct - hooks persist in beads (git-backed). But Claude Code isn't triggering the hooks that would reload that state.

#### What Happened in tackle-beads1.log

- Molecule bd-mol-5pz existed with 5 steps closed, 4 open
- Compaction summary included molecule ID and pending steps
- But Ruby's hook was **empty** - molecule wasn't hooked when poured
- Ruby closed bd-jc0w directly, bypassing remaining molecule steps
- Reflect step (bd-mol-0q8) never executed

#### IMPLEMENTED (2026-01-21)

The following fixes were applied to ~/.claude/skills/tackle/SKILL.md:

1. **Hook verification on pour** - Added `gt hook | grep` check after `gt mol attach`
2. **Compaction recovery instructions** - Added new section with steps to find orphaned molecules
3. **Issue-to-molecule linkage** - Added `bd dep add` to link source issue to molecule via parent-child

#### Related Upstream Issues

- Claude Code #13572 - PreCompact hook not triggered
- Claude Code #17237 - PostCompact hook request
- Claude Code #14258 - PostCompact hook request
- Beads #650 - Subagents + compaction issues

---

## hq-a71qm [task] P2

**Response to gastown#708 re: tackle skill**

Inspired by boshu2's pr-kit, I built a skill for my contribution workflow. Copy to `~/.claude/skills/` and say "let's tackle gt-1234" (using the issue ID directly is the most reliable trigger, but fuzzy matching like "let's tackle the docs issue" should work too).

Key features:
- Researches upstream first (existing PRs, issues, CONTRIBUTING.md) to avoid duplicate work
- Mandatory approval gates after planning and before PR submission
- Follows detected project conventions automatically
- Self-improving: logs friction points and proposes skill fixes when patterns emerge

Details: [aleiby/claude-config/skills/tackle](https://github.com/aleiby/claude-config/tree/master/skills/tackle)

---

## hq-aqvoi [task] P3 `blocked:external`

**Re-evaluate tackle formula titles vs descriptions after PR #1403**

External ref: gh:steveyegge/beads#1403

After steveyegge/beads#1403 lands, agents will see a hint to run `bd show <step-id>` for detailed instructions.

Currently tackle formula uses step titles to communicate guidance:
```toml
title = "[PLAN] Run /tackle --resume plan"
title = "[GATE-PLAN] Run /tackle --resume gate-plan"
```

This is a workaround because agents see titles in `bd mol current` but not descriptions.

### After PR #1403

Agents will see:
```
Progress: 1/8 steps complete

Run `bd show plan` to see detailed instructions.
```

This means:
1. Titles can be cleaner ("Create implementation plan" vs "[PLAN] Run /tackle --resume plan")
2. The `/tackle --resume` guidance can move to description
3. Step phase markers like [PLAN], [GATE-PLAN] may be unnecessary

### Files to update

- ~/.claude/skills/tackle/resources/tackle.formula.toml

### Blocked by

Waiting for steveyegge/beads#1403 to merge.

---

## hq-d1x34 [task] P3

**Evaluate using beads gate primitives in tackle skill**

The tackle skill currently implements approval gates ad-hoc:
- Natural language detection for "approve", "yes", "lgtm", etc.
- Manual CI polling via scripts (ci-status-check.sh)
- Gate state tracked implicitly by step status

Beads has formal gate primitives (see beads/website/docs/workflows/gates.md):
- `[steps.gate]` TOML declarations with type = human|timer|github
- `bd gate approve <step>` for explicit approval
- Built-in GitHub event integration (check_suite, pull_request events)
- State machine: pending -> open -> closed

### Evaluation questions

1. Would formal gates simplify the skill?
   - Remove natural language parsing boilerplate
   - Use `bd gate approve` instead of response detection
   - Declarative vs procedural

2. Would GitHub gates replace ci-status-check.sh?
   - `type = "github" event = "check_suite" status = "success"`
   - May handle polling automatically

3. What is lost?
   - Natural language flexibility ("ship it", "looks good")
   - Custom CI failure handling (pre-existing check detection)
   - "Explain" option at gate-plan

### Files to update if proceeding

- ~/.claude/skills/tackle/resources/tackle.formula.toml - add [steps.gate] blocks
- ~/.claude/skills/tackle/SKILL.md - simplify APPROVAL GATES section
- Possibly remove ci-status-check.sh if GitHub gates handle it

### Reference

Gate docs: beads/website/docs/workflows/gates.md
Current formula: ~/.claude/skills/tackle/resources/tackle.formula.toml

---

## hq-93jm [task] P3

**Refactor tackle scripts code**

Review the tackle skill scripts holistically and refactor the code.

These scripts were extracted incrementally one-by-one. Taking a step back to look at them together, there's likely opportunity to:
- Remove duplication across scripts
- Extract shared utilities
- Simplify logic
- Improve error handling consistency
- Clean up variable naming
- Improve test coverage
- Align documentation with TEST-SCENARIOS.md

Scripts to review:
- sling-tackle.sh
- env-check.sh
- record-pr-stats.sh
- Other scripts in resources/scripts/
