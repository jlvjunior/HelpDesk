# Roteiro da apresentação (até 20 minutos)

**Apresentador:** Joaquim Luiz Vitória Junior · **Disciplina:** Arquitetura de Computação em Nuvem · **Professor:** Erik Rosa Filippini

Os slides finais (PPT ou PDF) ficam nesta pasta: 12 slides e uma demo de 5 minutos.

| # | Slide | Tempo | Conteúdo |
|---|---|---|---|
| 1 | Capa | 0:30 | Nome do projeto, disciplina, professor e autor |
| 2 | Problema e cenário | 1:00 | Pedidos de suporte perdidos, falta de retorno ao solicitante |
| 3 | Solução e funcionalidades | 1:00 | Abrir, acompanhar, notificar; print da tela |
| 4 | Desenho da arquitetura | 2:00 | Diagrama da seção 2 do README de arquitetura |
| 5 | Stack utilizada | 1:00 | Tabela de tecnologias por camada |
| 6 | Fluxo com mensageria | 2:00 | Diagrama de sequência; por que assíncrono; DLQ e idempotência |
| 7 | Infraestrutura como código | 1:30 | Terraform (kind, Helm), Kustomize, Compose |
| 8 | Alta disponibilidade | 2:00 | Réplicas, probes, distribuição entre nós, PDB, rolling update |
| 9 | Escalabilidade | 1:00 | Serviços sem estado, HPA, consumidores concorrentes |
| 10 | Monitoramento e observabilidade | 2:00 | Métricas (RED + negócio), logs estruturados, alertas; print do dashboard |
| 11 | **Demo** | 5:00 | Ver roteiro abaixo |
| 12 | Limitações, evolução e RACI | 1:00 | Pontos únicos de falha locais, caminho para nuvem gerenciada |

## Roteiro da demo (ao vivo ou gravada)

Deixar o ambiente no ar e a carga rodando **antes** de começar (`./scripts/gerar-carga.sh 500`).

1. **Aplicação (1 min).** Abrir um chamado na tela. Mostrar que ele aparece na lista e que, em seguida, a notificação surge no painel ao lado.
2. **Mensageria (1 min).** No painel do RabbitMQ, mostrar a exchange `helpdesk.events` e a fila `notifications` com as taxas de publicação e consumo.
3. **Dashboard (1 min).** No Grafana, mostrar requisições por segundo, latência, chamados abertos e o balanceamento entre as réplicas.
4. **Logs (1 min).** No painel de logs, filtrar pelo id do chamado recém-criado e mostrar a sequência nos dois serviços.
5. **Resiliência (1 min).** Derrubar uma réplica do ticket-service (`docker kill ...` ou `kubectl delete pod ...`), mostrar que a tela continua funcionando e que o painel de réplicas cai e se recupera.

**Plano B:** gravar a demo com antecedência. Se o ambiente falhar na hora, exibir o vídeo.

## Perguntas prováveis

- **Por que RabbitMQ e não Kafka?** O caso de uso é uma fila de trabalho com confirmação por mensagem e DLQ, que é o modelo nativo do RabbitMQ. Kafka faria sentido para alto volume, retenção e reprocessamento de histórico.
- **O que acontece se o banco cair?** O `/readyz` falha, as réplicas saem do balanceamento e a API responde erro até a volta. Em produção, um banco gerenciado Multi-AZ faria o failover.
- **Por que um banco só para os dois serviços?** Para manter o ambiente local leve. Cada serviço acessa apenas as próprias tabelas, o que permite separar em duas instâncias sem mudar o código, apenas a `DATABASE_URL`.
- **Onde entraria serverless?** No envio real do e-mail: uma função acionada pela fila, cobrada por execução.
- **Como garantir que nenhum evento se perca?** Hoje: mensagens persistentes, confirms, ack manual e DLQ. O ponto em aberto é a publicação após o commit, resolvido com o padrão Outbox.
