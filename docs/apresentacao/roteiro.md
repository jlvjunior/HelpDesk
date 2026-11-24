# Roteiro da apresentação (até 20 minutos)

**Apresentador:** Joaquim Luiz Vitória Junior · **Disciplina:** Arquitetura de Computação em Nuvem · **Professor:** Erik Rosa Filippini

Os slides finais ficam nesta pasta, em PPTX e PDF: 17 slides, com uma demo de 5 minutos (cerca de 19 minutos e meio no total).

| # | Slide | Tempo | Conteúdo |
|---|---|---|---|
| 1 | Capa | 0:20 | Nome do projeto, disciplina, professor e autor |
| 2 | O problema | 0:40 | Pedidos de suporte perdidos, falta de retorno ao solicitante |
| 3 | A solução | 1:00 | Funcionalidades: chamados, atendimento online, ações em lote, reabertura, notificações |
| 4 | Perfis de acesso | 1:00 | Usuário, operador e administrador: o que cada um faz |
| 5 | Telas da aplicação | 1:00 | Fila do operador e central de conversas (prints) |
| 6 | Ciclo de vida do chamado | 1:00 | Regras de status por perfil e pedido de reabertura |
| 7 | Desenho da arquitetura | 1:30 | Diagrama da seção 2 do README de arquitetura |
| 8 | Stack utilizada | 0:40 | Tabela de tecnologias por camada |
| 9 | Fluxo com mensageria | 1:30 | Síncrono e assíncrono; DLQ e idempotência |
| 10 | Infraestrutura como código | 1:00 | Terraform (kind, Helm), Kustomize, Compose |
| 11 | Na nuvem: alta disponibilidade na AWS | 1:30 | Diagrama: ALB, dois servidores de aplicação em zonas diferentes e servidor de dados; Terraform e deploy gradual |
| 12 | Alta disponibilidade | 1:30 | Réplicas, probes, distribuição entre nós, PDB, rolling update |
| 13 | Escalabilidade | 0:40 | Serviços sem estado (inclusive o login com JWT), HPA, consumidores concorrentes |
| 14 | Monitoramento e observabilidade | 1:30 | Métricas (RED + negócio), logs estruturados, alertas; print do dashboard |
| 15 | **Demo** | 5:00 | Ver roteiro abaixo |
| 16 | Limitações e evolução | 0:40 | Pontos únicos de falha, caminho para nuvem gerenciada |
| 17 | Encerramento | 0:20 | Perguntas, repositório e endereço na AWS |

## Roteiro da demo (ao vivo ou gravada)

Antes de começar: **Start Lab** no AWS Academy uns 10 minutos antes, carga gerada no terminal do laboratório (`bash scripts/gerar-carga.sh 200 "http://$(cd infra/aws && terraform output -raw alb_dns)"`) e três janelas abertas no endereço do load balancer — uma normal como **usuário**, uma anônima como **operador** e outra (outro navegador ou perfil) como **administrador**.

1. **Usuário (1 min).** Abrir um chamado e mandar uma mensagem na conversa.
2. **Operador (1 min).** Mostrar o botão "Conversas" com "1 nova", responder e ver a resposta chegar sozinha na janela do usuário. Filtrar a fila por prioridade alta e status aberto, selecionar todos e resolver em lote com uma justificativa. Mostrar que a opção "Fechado" está bloqueada para ele.
3. **Usuário e administrador (1 min).** O usuário pede a reabertura de um chamado resolvido; o administrador filtra "Só pedidos de reabertura" e devolve o chamado à fila. Mostrar a notificação recebida pelo usuário.
4. **Observabilidade (1 min).** No Grafana, requisições, latência, eventos publicados e consumidos e o balanceamento entre réplicas; no painel de logs, seguir o chamado pelo id.
5. **Alta disponibilidade (1 min).** Derrubar uma réplica do ticket-service (no terminal do laboratório: `hd-a 'docker kill helpdesk-ticket-service-1'`) e mostrar que a aplicação continua funcionando pelo endereço do load balancer, inclusive o login, e que no Grafana as réplicas caem de 2 para 1 e voltam sozinhas. Explicar que a versão com dois servidores está pronta no Terraform, mas o laboratório da turma só mantém uma instância ligada (CloudTrail).

**Plano B:** o ambiente local no notebook (`docker compose up -d`, em http://localhost:8080) ou a demo gravada com antecedência.

## Perguntas prováveis

- **Por que RabbitMQ e não Kafka?** O caso de uso é uma fila de trabalho com confirmação por mensagem e DLQ, que é o modelo nativo do RabbitMQ. Kafka faria sentido para alto volume, retenção e reprocessamento de histórico.
- **Como o login não quebra a escalabilidade?** O token JWT carrega o perfil e é validado por qualquer réplica com o mesmo segredo, sem sessão em memória nem consulta ao banco.
- **A permissão é só na tela?** Não. Cada rota confere o perfil no backend; a tela apenas esconde o que o perfil não pode usar.
- **Por que o chat usa polling e não WebSocket?** Polling a cada 2 segundos mantém os serviços sem estado e funciona atrás de qualquer balanceador. WebSocket seria a evolução para volume maior.
- **O que acontece se o banco cair?** O `/readyz` falha, as réplicas saem do balanceamento e a API responde erro até a volta. Em produção, um banco gerenciado Multi-AZ faria o failover.
- **Por que um banco só para os dois serviços?** Para manter o ambiente local leve. Cada serviço acessa apenas as próprias tabelas, o que permite separar em duas instâncias sem mudar o código, apenas a `DATABASE_URL`.
- **Onde entraria serverless?** No envio real do e-mail: uma função acionada pela fila, cobrada por execução.
- **Como garantir que nenhum evento se perca?** Hoje: mensagens persistentes, confirms, ack manual e DLQ. O ponto em aberto é a publicação após o commit, resolvido com o padrão Outbox.
