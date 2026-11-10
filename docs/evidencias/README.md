# Evidências de funcionamento

Esta pasta contém os registros **reais** da aplicação em execução (itens 4 e 5 da atividade), coletados com o ambiente Docker Compose no ar. O roteiro abaixo descreve como eles foram gerados e permite reproduzi-los.

## Roteiro de coleta (Docker Compose)

```bash
docker compose up -d --build
docker compose ps                         # todos os serviços devem estar "running"/"healthy"
./scripts/gerar-carga.sh 200
```

### Item 4 — Logs e eventos → `logs/`

```powershell
docker compose logs --no-color ticket-service | Out-File -Encoding utf8 docs\evidencias\logs\ticket-service.log
docker compose logs --no-color notification-service | Out-File -Encoding utf8 docs\evidencias\logs\notification-service.log
```

Para evidenciar o rastreamento de um chamado de ponta a ponta, abrir um chamado pela tela, copiar o `id` (o primeiro em http://localhost:8080/api/tickets) e executar:

```powershell
docker compose logs --no-color ticket-service notification-service | Select-String "<id do chamado>" | Out-File -Encoding utf8 docs\evidencias\logs\rastreio-de-um-chamado.log
```

(No Linux ou no macOS, usar `>` no lugar de `| Out-File ...` e `grep` no lugar de `Select-String`.)

O arquivo deve mostrar, em sequência: `chamado aberto` → `evento publicado` → `notificação enviada (simulada)`.

### Item 5 — Dashboard → `dashboards/`

1. Abrir o Grafana em http://localhost:3000 (admin / admin). O dashboard "HelpDesk Cloud - Visão geral" abre como página inicial.
2. Com a carga rodando, tirar um print da tela inteira e salvar como `dashboards/visao-geral.png`.
3. Opcional: em **Explore → Loki**, consultar `{service="notification-service"} |= "notificação enviada"` e salvar como `dashboards/logs-loki.png`.
4. Opcional: print da fila no RabbitMQ (http://localhost:15672 → Queues) como `dashboards/rabbitmq-filas.png`.

## Demonstrações de resiliência (boas para a apresentação)

| Teste | Comando | Resultado esperado |
|---|---|---|
| Queda de uma réplica | `docker kill helpdesk-ticket-service-1` e, depois, `docker compose up -d` | A aplicação continua respondendo com a réplica restante; o painel de réplicas cai para 1 e volta para 2 após o `up -d` (no Kubernetes, `kubectl delete pod` e o pod é recriado sozinho) |
| Consumidor fora do ar | `docker compose stop notification-service`, abrir chamados, `docker compose start notification-service` | Chamados são abertos normalmente; as mensagens acumulam na fila e são entregues na volta |
| Escala automática (Kubernetes) | `./scripts/gerar-carga.sh 2000` e `kubectl -n helpdesk get hpa -w` | Com carga suficiente, o HPA aumenta as réplicas |
| Queda de um nó (Kubernetes) | `docker stop helpdesk-worker` | Os pods são recriados no outro nó e a aplicação segue no ar |

## Checklist de validação do ambiente

Situação em 09/11/2026. Se algo falhar, o primeiro passo é `docker compose logs <serviço>`.

- [x] `docker compose up -d --build` sobe todos os serviços
- [x] A tela em http://localhost:8080 abre e mostra "API online"
- [x] Um chamado aberto gera uma notificação no painel em poucos segundos
- [x] Em http://localhost:9090/targets todos os alvos estão "UP"
- [x] O dashboard do Grafana mostra dados nos painéis, inclusive o de logs (o painel de erros 5xx fica sem dados enquanto não há erros)
- [ ] `./scripts/k8s-up.sh` conclui sem erros
- [ ] `kubectl -n helpdesk get pods` mostra todos os pods "Running" e distribuídos entre os nós
