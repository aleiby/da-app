#!/bin/bash
# Set up Gas Town rig hooks for Digital Arcana.
# Run this after creating a new rig: gt rig add da <repo-url>
#
# Creates setup hooks that run when polecats are spawned:
# - 01-ensure-node-modules.sh: Serializes npm ci to prevent memory exhaustion

set -e

# Find rig root (go up from crew/moriarty to da/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RIG_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Verify we're in a rig
if [ ! -d "$RIG_ROOT/mayor/rig" ]; then
    echo "Error: Could not find rig root (expected mayor/rig at $RIG_ROOT)"
    exit 1
fi

echo "Setting up rig hooks in: $RIG_ROOT"

# Create setup-hooks directory
mkdir -p "$RIG_ROOT/.runtime/setup-hooks"

# Create the node_modules setup hook
cat > "$RIG_ROOT/.runtime/setup-hooks/01-ensure-node-modules.sh" << 'EOF'
#!/bin/bash
# Ensure node_modules is available for polecat worktrees.
# Uses flock to serialize npm ci across concurrent polecat spawns.
# Only runs npm ci if package-lock.json changed since last install.

SOURCE="$GT_RIG_PATH/mayor/rig"
LOCKFILE="$GT_RIG_PATH/.runtime/npm-install.lock"
HASHFILE="$GT_RIG_PATH/.runtime/npm-install.hash"

(
    flock -x 200

    CURRENT_HASH=$(md5sum "$SOURCE/package-lock.json" | cut -d' ' -f1)
    STORED_HASH=$(cat "$HASHFILE" 2>/dev/null || echo "")

    if [ "$CURRENT_HASH" != "$STORED_HASH" ] || [ ! -d "$SOURCE/node_modules" ]; then
        cd "$SOURCE" && npm ci --silent
        echo "$CURRENT_HASH" > "$HASHFILE"
    fi
) 200>"$LOCKFILE"

# Sync to polecat worktree (incremental, removes stale packages)
rsync -a --delete "$SOURCE/node_modules/" "$GT_WORKTREE_PATH/node_modules/"
EOF

chmod +x "$RIG_ROOT/.runtime/setup-hooks/01-ensure-node-modules.sh"

echo "Created: $RIG_ROOT/.runtime/setup-hooks/01-ensure-node-modules.sh"
echo ""
echo "Setup complete. Polecats will now share node_modules from mayor/rig."
