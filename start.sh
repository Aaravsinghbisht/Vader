#!/usr/bin/env bash
# Vader agent - web chat launcher.
# Ensures Ollama + the local model are running, then starts the Next.js web chat (port 3000).
set -e

OLLAMA_MODEL="${OLLAMA_MODEL:-lfm2.5}"

# Start Ollama if not running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "Starting Ollama..."
  nohup ollama serve > /tmp/ollama.log 2>&1 &
  sleep 3
fi
if curl -s http://localhost:11434/api/tags | grep -q "$OLLAMA_MODEL"; then
  echo "Ollama: OK (model: $OLLAMA_MODEL)"
else
  echo "Ollama running but $OLLAMA_MODEL not found. Pull it: ollama pull $OLLAMA_MODEL"
fi

cd "$(dirname "$0")"
echo "Starting Vader web chat at http://localhost:3000/chat"
export OLLAMA_MODEL
npm run dev
