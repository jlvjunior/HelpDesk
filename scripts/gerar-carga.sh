#!/usr/bin/env bash
# Gera tráfego para popular os dashboards e os logs.
# Uso: ./scripts/gerar-carga.sh [quantidade] [url-base]
set -euo pipefail
N="${1:-100}"
BASE="${2:-http://localhost:8080}"
PRIORIDADES=(baixa media alta)
STATUS=(em_andamento resolvido fechado)

for i in $(seq 1 "$N"); do
  p="${PRIORIDADES[$((RANDOM % 3))]}"
  id=$(curl -fsS -X POST "$BASE/api/tickets" -H 'Content-Type: application/json' \
    -d "{\"title\":\"Chamado de teste $i\",\"description\":\"Gerado pelo script de carga\",\"requester\":\"usuario$i@empresa.com\",\"priority\":\"$p\"}" \
    | sed -E 's/.*"id":"([^"]+)".*/\1/')
  if (( i % 2 == 0 )); then
    s="${STATUS[$((RANDOM % 3))]}"
    curl -fsS -X PATCH "$BASE/api/tickets/$id" -H 'Content-Type: application/json' -d "{\"status\":\"$s\"}" > /dev/null
  fi
  curl -fsS "$BASE/api/tickets" > /dev/null
  # Requisições inválidas de propósito, para aparecerem respostas 4xx nos gráficos e nos logs
  if (( i % 10 == 0 )); then
    curl -s -o /dev/null -X POST "$BASE/api/tickets" -H 'Content-Type: application/json' -d '{"title":"x"}'
  fi
  sleep 0.1
done
echo "Carga concluída: $N chamados criados em $BASE"
