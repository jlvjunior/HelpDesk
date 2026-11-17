#!/usr/bin/env bash
# Gera tráfego para popular os dashboards e os logs.
# Uso: ./scripts/gerar-carga.sh [quantidade] [url-base]
# Usa as contas de demonstração: o usuário abre os chamados, o operador responde e muda o status,
# e o administrador fecha uma parte (só ele pode fechar).
set -euo pipefail
N="${1:-100}"
BASE="${2:-http://localhost:8080}"
USER_EMAIL="${USER_EMAIL:-usuario@helpdesk.local}"
USER_PASSWORD="${USER_PASSWORD:-usuario123}"
OPERATOR_EMAIL="${OPERATOR_EMAIL:-operador@helpdesk.local}"
OPERATOR_PASSWORD="${OPERATOR_PASSWORD:-operador123}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@helpdesk.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
PRIORIDADES=(baixa media alta)
STATUS=(em_andamento resolvido)
JSON='Content-Type: application/json'

login() {
  curl -fsS -X POST "$BASE/api/auth/login" -H "$JSON" -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | sed -E 's/.*"token":"([^"]+)".*/\1/'
}

USER_TOKEN=$(login "$USER_EMAIL" "$USER_PASSWORD")
OPERATOR_TOKEN=$(login "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD")
ADMIN_TOKEN=$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")

for i in $(seq 1 "$N"); do
  p="${PRIORIDADES[$((RANDOM % 3))]}"
  id=$(curl -fsS -X POST "$BASE/api/tickets" -H "$JSON" -H "Authorization: Bearer $USER_TOKEN" \
    -d "{\"title\":\"Chamado de teste $i\",\"description\":\"Gerado pelo script de carga\",\"priority\":\"$p\"}" \
    | sed -E 's/.*"id":"([^"]+)".*/\1/')
  # Um terço fica aberto; nos demais o operador responde e muda o status.
  if (( i % 3 != 0 )); then
    curl -fsS -X POST "$BASE/api/tickets/$id/messages" -H "$JSON" -H "Authorization: Bearer $OPERATOR_TOKEN" \
      -d '{"body":"Recebemos o seu chamado e estamos verificando."}' > /dev/null
    s="${STATUS[$((RANDOM % 2))]}"
    curl -fsS -X PATCH "$BASE/api/tickets/$id" -H "$JSON" -H "Authorization: Bearer $OPERATOR_TOKEN" -d "{\"status\":\"$s\"}" > /dev/null
  fi
  # A cada quatro chamados, o administrador fecha um.
  if (( i % 4 == 0 )); then
    curl -fsS -X PATCH "$BASE/api/tickets/$id" -H "$JSON" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"fechado","justification":"Encerrado após confirmação do solicitante"}' > /dev/null
  fi
  curl -fsS "$BASE/api/tickets" -H "Authorization: Bearer $OPERATOR_TOKEN" > /dev/null
  # Requisições inválidas de propósito, para aparecerem respostas 4xx nos gráficos e nos logs
  if (( i % 10 == 0 )); then
    curl -s -o /dev/null -X POST "$BASE/api/tickets" -H "$JSON" -H "Authorization: Bearer $USER_TOKEN" -d '{"title":"x"}'
    curl -s -o /dev/null -X POST "$BASE/api/auth/login" -H "$JSON" -d '{"email":"ninguem@helpdesk.local","password":"errada"}'
  fi
  sleep 0.1
done
echo "Carga concluída: $N chamados criados em $BASE"
