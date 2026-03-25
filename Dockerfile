FROM node:22-bookworm-slim

SHELL ["/bin/bash", "-c"]

# --- System packages ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget ca-certificates git unzip tar \
    ripgrep fd-find jq bat tree fzf \
    openssl openssh-client openssh-server \
    python3 make g++ \
    neovim \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# --- GitHub CLI ---
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# --- User (UID 1000 for shared volume compatibility) ---
# node:22 base image already has UID 1000 as 'node', so reassign it
RUN usermod -l ndtn -d /home/ndtn -m node \
    && groupmod -n ndtn node

# --- Standard home directories ---
RUN mkdir -p \
    /home/ndtn/Documents \
    /home/ndtn/Downloads \
    /home/ndtn/Projects \
    /home/ndtn/.ssh \
    /home/ndtn/.claude \
    /home/ndtn/.local/bin \
    /home/ndtn/.config \
    && chown -R ndtn:ndtn /home/ndtn

# --- Install Claude Code CLI ---
USER ndtn
ENV HOME=/home/ndtn
ENV PATH="/home/ndtn/.local/bin:$PATH"
RUN curl -fsSL https://claude.ai/install.sh | bash

# --- Install OpenCode ---
RUN curl -fsSL https://opencode.ai/install | bash

# --- SSH server setup ---
USER root
RUN mkdir -p /run/sshd \
    && sed -i 's/#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config \
    && sed -i 's/#PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# --- Install gttyd ---
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev && npm cache clean --force
COPY server.js .
COPY public/ public/

# --- Copy ghostty-web dist to public for serving ---
RUN cp node_modules/ghostty-web/dist/* public/ 2>/dev/null || true

# --- Entrypoint ---
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/home/ndtn/.claude", "/home/ndtn/Projects", "/home/ndtn/Documents", "/home/ndtn/Downloads"]

EXPOSE 8080 22

LABEL org.opencontainers.image.title="gttyd"
LABEL org.opencontainers.image.description="Mobile-friendly web terminal powered by ghostty-web"

ENTRYPOINT ["/entrypoint.sh"]
