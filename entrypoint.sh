#!/bin/bash
set -e

HOME=/home/ndtn
PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

# Fix ownership for mounted volumes (non-recursive for .claude to preserve file metadata)
chown ndtn:ndtn "$HOME/.claude" 2>/dev/null || true
chown -R ndtn:ndtn "$HOME/Projects" "$HOME/Documents" "$HOME/Downloads" 2>/dev/null || true
chown ndtn:ndtn "$HOME/.ssh" 2>/dev/null || true

# Setup SSH key if mounted (for GitHub auth)
if [ -f /etc/gttyd/ssh-key ]; then
    cp /etc/gttyd/ssh-key "$HOME/.ssh/id_ed25519"
    chown ndtn:ndtn "$HOME/.ssh/id_ed25519"
    chmod 600 "$HOME/.ssh/id_ed25519"
    # Derive public key from private key (needed for vault cert signing)
    ssh-keygen -y -f "$HOME/.ssh/id_ed25519" > "$HOME/.ssh/id_ed25519.pub"
    chown ndtn:ndtn "$HOME/.ssh/id_ed25519.pub"
    su -c "ssh-keyscan github.com >> $HOME/.ssh/known_hosts 2>/dev/null" ndtn || true
fi

# Setup git config
if [ -n "$GIT_USER_NAME" ]; then
    su -c "git config --global user.name '$GIT_USER_NAME'" ndtn
fi
if [ -n "$GIT_USER_EMAIL" ]; then
    su -c "git config --global user.email '$GIT_USER_EMAIL'" ndtn
fi

# Set default editor to neovim
su -c "git config --global core.editor nvim" ndtn

# Clone bricknet if not present (needed for vault scripts + SSH config)
BRICKNET_DIR="$HOME/Projects/bricknet"
if [ ! -d "$BRICKNET_DIR/.git" ] && [ -n "$GH_TOKEN" ]; then
    /usr/sbin/runuser -u ndtn -- env GH_TOKEN="$GH_TOKEN" \
        git clone https://x-access-token:${GH_TOKEN}@github.com/ndtn-dev/bricknet.git "$BRICKNET_DIR" 2>/dev/null || true
fi

# Include bricknet SSH config (for host aliases like 'core', 'outpost')
BRICKNET_SSH_CONFIG="$BRICKNET_DIR/.ssh/config"
if [ -f "$BRICKNET_SSH_CONFIG" ]; then
    INCLUDE_LINE="Include $BRICKNET_SSH_CONFIG"
    grep -qF "$INCLUDE_LINE" "$HOME/.ssh/config" 2>/dev/null || \
        /usr/sbin/runuser -u ndtn -- bash -c "echo '$INCLUDE_LINE' >> $HOME/.ssh/config"
fi

# Vault SSH certificate signing (background)
if [ -n "$VAULT_APPROLE_ROLE_ID" ] && [ -n "$VAULT_APPROLE_SECRET_ID" ]; then
    (
        VAULT_SCRIPT="$BRICKNET_DIR/.ssh/vault-ssh-cert-sign.sh"

        if [ -f "$VAULT_SCRIPT" ]; then
            # Generate SSH key if missing
            if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
                /usr/sbin/runuser -u ndtn -- ssh-keygen -t ed25519 -f "$HOME/.ssh/id_ed25519" -N "" -q
            fi

            # Init vault SSH cert signing via AppRole
            /usr/sbin/runuser -u ndtn -- bash "$VAULT_SCRIPT" init approle \
                "$VAULT_APPROLE_ROLE_ID" "$VAULT_APPROLE_SECRET_ID" || true

            # Scan bricknet node host keys
            for ip in 192.9.239.160 192.168.1.99 163.192.47.113 46.225.132.171; do
                /usr/sbin/runuser -u ndtn -- ssh-keyscan "$ip" >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
            done
        fi
    ) &
fi

# Start gttyd as ndtn
exec /usr/sbin/runuser -u ndtn -- env \
    PATH="$PATH" \
    HOME="$HOME" \
    SHELL=/bin/bash \
    EDITOR=nvim \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    GH_TOKEN="${GH_TOKEN:-}" \
    VAULT_ADDR="${VAULT_ADDR:-}" \
    PORT="${PORT:-8080}" \
    HOST="${HOST:-0.0.0.0}" \
    node /app/server.js
