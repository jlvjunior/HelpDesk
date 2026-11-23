#!/bin/bash
# Executado via SSH em cada servidor de aplicação, um de cada vez, pelo workflow deploy-aws.yml.
# 1) baixa o código novo; 2) constrói as imagens SEM parar nada (a parte demorada);
# 3) troca os contêineres; 4) só termina quando este servidor voltou a responder.
set -euo pipefail
cd /opt/helpdesk
git fetch --quiet origin main
echo "Servidor $(hostname): versão $(git rev-parse --short HEAD) → $(git rev-parse --short origin/main)"
git reset --hard --quiet origin/main
cd deploy/aws/app
docker compose build
docker compose up -d --remove-orphans

for tentativa in $(seq 1 30); do
  web=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/healthz || echo 000)
  api=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/tickets || echo 000)
  if [ "$web" = "200" ] && [ "$api" = "401" ]; then
    echo "✅ Servidor respondendo de novo (frontend $web, API $api)."
    # Tempo para o load balancer confirmar a saúde (2 verificações de 10 s) antes do próximo servidor.
    sleep 25
    docker compose ps --format 'table {{.Service}}\t{{.Status}}'
    docker image prune -f > /dev/null
    exit 0
  fi
  echo "Aguardando o servidor responder (frontend $web, API $api)…"
  sleep 5
done
echo "::error::O servidor não voltou a responder em 150 s; o deploy para aqui e o outro servidor continua atendendo."
exit 1
