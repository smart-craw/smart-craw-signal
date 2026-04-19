FROM node:24-alpine
COPY llm /app/llm/
COPY *.json /app/
COPY *.ts /app/
RUN apk add --no-cache bash # bash is needed for claude code

# location of mounted files
RUN mkdir /app/mounts

## Lock down "node" user: only allow writes to /app/bots, /app/db, and ~/.claude
# Set all of /app to root:root, read-only for node
RUN chown -R root:root /app && chmod -R 755 /app
# Grant node write access ONLY to the specific dirs
RUN chown node:node /app/mounts && chmod 700 /app/mounts
# Create ~/.claude (node's home is /home/node) and grant write access
RUN mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude && chmod 700 /home/node/.claude

WORKDIR /app/
RUN npm ci --only=production
# Switch to the non-root user
USER node
# don't manually set PWD...keep this default
ENV PWD="/app/mounts"
ENV ANTHROPIC_BASE_URL="http://host.docker.internal:11434"
ENV ANTHROPIC_AUTH_TOKEN="ollama"
ENV ANTHROPIC_API_KEY="sk-local-dummy"
ENV LOG_LEVEL="info"
ENV MODEL="hf.co/Qwen/Qwen3-4B-GGUF:latest"
ENV SIGNAL_BOT_PHONE_NUMBER="0123456789"
ENV SIGNAL_USER_ADMIN_NUMBER="9876543210"
ENV SIGNAL_REST_ENDPOINT="http://localhost:9001"
# this is arbitrary and can be overwritten.  But does allow a "default" of a single session even after restarting docker
ENV SESSION_ID="d52f3a42-1fdc-423d-b2ad-e01b50032444"
# "<|channel>" for gemma
ENV START_THINK_TOKEN="<think>"
# "<channel|>" for gemma
ENV END_THINK_TOKEN="</think>"

CMD ["node", "index.ts"]
