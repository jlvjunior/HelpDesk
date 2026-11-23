# Evidências de funcionamento

## Arquivos

| Item da atividade | Arquivo | O que mostra |
|---|---|---|
| 4 · Logs e eventos | [logs/ticket-service.log](logs/ticket-service.log) | Logs em JSON das duas réplicas do ticket-service: chamados abertos, status alterados e eventos publicados |
| 4 · Logs e eventos | [logs/notification-service.log](logs/notification-service.log) | Logs das duas réplicas do notification-service: eventos consumidos e notificações enviadas |
| 4 · Logs e eventos | [logs/rastreio-de-um-chamado.log](logs/rastreio-de-um-chamado.log) | Um chamado seguido pelo id nos dois serviços: aberto → evento publicado → notificação, em réplicas diferentes |
| 5 · Dashboard | [dashboards/grafana-visao-geral.png](dashboards/grafana-visao-geral.png) | Dashboard "HelpDesk Cloud - Visão geral": réplicas, chamados, notificações, fila, DLQ, requisições e latência |
| 5 · Dashboard | [dashboards/grafana-visao-geral-logs.png](dashboards/grafana-visao-geral-logs.png) | Mesmo dashboard com o painel de logs do Loki |
| 5 · Monitoramento | [dashboards/prometheus-alvos-up.png](dashboards/prometheus-alvos-up.png) | Prometheus com os 6 alvos "UP": duas réplicas de cada microsserviço, RabbitMQ e o próprio Prometheus |

Coleta feita em 09/11/2026 no Docker Compose, com 100 chamados gerados pelo `scripts/gerar-carga.sh`. A mesma pilha roda na AWS desde 23/11/2026 (ver [docs/AWS-ACADEMY.md](../AWS-ACADEMY.md)).


Esta pasta contém os registros **reais** da aplicação em execução (itens 4 e 5 da atividade), coletados com o ambiente Docker Compose no ar. O roteiro abaixo descreve como eles foram gerados e permite reproduzi-los.

## Roteiro de coleta (Docker Compose)

```powershell
docker compose up -d --build
docker compose ps                                    # todos os serviços devem estar "running"/"healthy"
wsl -d Ubuntu bash ./scripts/gerar-carga.sh 200
```

O script de carga entra com as contas de demonstração: o usuário abre os chamados, o operador responde e muda o status, e o administrador fecha uma parte. Assim os logs e o dashboard mostram também login, conversas e fechamentos.

### Item 4 — Logs e eventos → `logs/`

```powershell
cmd /c "docker compose logs --no-color ticket-service > docs\evidencias\logs\ticket-service.log"
cmd /c "docker compose logs --no-color notification-service > docs\evidencias\logs\notification-service.log"
```

O `cmd /c` grava a saída do Docker sem conversão, evitando acentos quebrados e linhas cortadas, que acontecem com o `Out-File` do PowerShell.

Para evidenciar o rastreamento de um chamado de ponta a ponta: entrar como usuário, abrir um chamado e mandar uma mensagem; entrar como operador, responder e resolver. O `id` do chamado aparece nos logs na linha `chamado aberto` (campo `ticketId`). Depois executar, trocando o id:

```powershell
cmd /c "docker compose logs --no-color ticket-service notification-service | findstr <id do chamado> > docs\evidencias\logs\rastreio-de-um-chamado.log"
```

(No Linux ou no macOS: `docker compose logs --no-color ticket-service notification-service | grep <id> > ...`.)

O arquivo deve mostrar, em sequência: `chamado aberto` → `evento publicado` → `notificação enviada (simulada)` → `mensagem registrada no chamado` → `status do chamado alterado` e as notificações correspondentes.

### Item 5 — Dashboard → `dashboards/`

1. Abrir o Grafana em http://localhost:3000 (admin / admin; se a porta foi trocada no `.env`, http://localhost:3001). O dashboard "HelpDesk Cloud - Visão geral" abre como página inicial.
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

Situação em 09/11/2026 (primeira versão) e 17/11/2026 (versão com perfis). Se algo falhar, o primeiro passo é `docker compose logs <serviço>`.

- [x] `docker compose up -d --build` sobe todos os serviços
- [x] A tela em http://localhost:8080 abre e mostra "API online"
- [x] Um chamado aberto gera uma notificação no painel em poucos segundos
- [x] Em http://localhost:9090/targets todos os alvos estão "UP"
- [x] O dashboard do Grafana mostra dados nos painéis, inclusive o de logs (o painel de erros 5xx fica sem dados enquanto não há erros)
- [x] Login com as três contas de demonstração mostra a tela de cada perfil
- [ ] Mensagem do usuário aparece como "nova" no botão "Conversas" do operador
- [ ] Operador não consegue fechar; o administrador fecha e devolve à fila
- [ ] Pedido de reabertura do usuário aparece na fila e gera notificação
- [x] `terraform apply` em `infra/aws` (versão com servidor único) cria o servidor na AWS (23/11/2026) e a aplicação responde pelo IP público
- [ ] Versão com load balancer: aplicação responde pelo ALB e continua no ar com o app-a desligado
- [ ] `./scripts/k8s-up.sh` conclui sem erros
- [ ] `kubectl -n helpdesk get pods` mostra todos os pods "Running" e distribuídos entre os nós
