#!/bin/bash
set -e

HOME=/home/ndtn
PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

# Fix ownership for mounted volumes
chown -R ndtn:ndtn "$HOME/.claude" "$HOME/Projects" "$HOME/Documents" "$HOME/Downloads" 2>/dev/null || true

# Setup SSH key if mounted
if [ -f /etc/gttyd/ssh-key ]; then
    cp /etc/gttyd/ssh-key "$HOME/.ssh/id_ed25519"
    chown ndtn:ndtn "$HOME/.ssh/id_ed25519"
    chmod 600 "$HOME/.ssh/id_ed25519"
    su -c "ssh-keyscan github.com >> $HOME/.ssh/known_hosts 2>/dev/null" ndtn || true
fi

# Setup git config
if [ -n "$GIT_USER_NAME" ]; then
    su -c "git config --global user.name '$GIT_USER_NAME'" ndtn
fi
if [ -n "$GIT_USER_EMAIL" ]; then
    su -c "git config --global user.email '$GIT_USER_EMAIL'" ndtn
fi

# Start gttyd as ndtn
exec /usr/sbin/runuser -u ndtn -- env \
    PATH="$PATH" \
    HOME="$HOME" \
    SHELL=/bin/bash \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    GH_TOKEN="${GH_TOKEN:-}" \
    PORT="${PORT:-8080}" \
    HOST="${HOST:-0.0.0.0}" \
    node /app/server.js
