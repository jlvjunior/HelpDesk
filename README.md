# HelpDesk Cloud

Aplicação de chamados de suporte em arquitetura de microsserviços, desenvolvida como atividade de conclusão da disciplina de **Arquitetura de Computação em Nuvem**.

| | |
|---|---|
| **Autor** | Joaquim Luiz Vitória Junior |
| **Disciplina** | Arquitetura de Computação em Nuvem |
| **Professor** | Erik Rosa Filippini |

Trabalho individual — ver [RACI](docs/RACI.md).

## Cenário

Uma empresa de médio porte recebe pedidos de suporte de TI por e-mail e por mensagens avulsas. Pedidos se perdem, ninguém sabe o status e o solicitante não recebe retorno. O HelpDesk Cloud centraliza a abertura e o acompanhamento dos chamados e **notifica o solicitante de forma assíncrona** a cada mudança, sem que a API de chamados dependa do envio da notificação.

## Perfis de acesso

O endereço é o mesmo para todos (http://localhost:8080); a tela e as permissões mudam conforme a conta.

| Perfil | O que vê e faz | Conta de demonstração | Senha |
|---|---|---|---|
| **Usuário** | Abre chamados, acompanha apenas os próprios, conversa com o atendimento, pede reabertura e vê as próprias notificações | `usuario@helpdesk.local` | `usuario123` |
| **Operador** | Vê a fila com todos os chamados, coloca em andamento, resolve, reabre os resolvidos e responde aos solicitantes | `operador@helpdesk.local` | `operador123` |
| **Administrador** | Tudo o que o operador faz, mais fechar chamados, devolver chamados fechados à fila e gerir contas e perfis | `admin@helpdesk.local` | `admin123` |

Qualquer pessoa pode criar uma conta de usuário na tela de entrada; contas de operador e de administrador são criadas pelo administrador. As três contas acima são criadas na primeira inicialização e servem só para demonstração: em um ambiente real, as senhas devem ser trocadas pelas variáveis `ADMIN_PASSWORD`, `OPERATOR_PASSWORD` e `USER_PASSWORD`, e o segredo dos tokens por `JWT_SECRET`.

## Funcionalidades

- **Login com três perfis** no mesmo endereço; a tela e as permissões mudam conforme a conta.
- **Chamados** com prioridade, busca e filtros por texto, usuário, prioridade, status e período.
- **Atendimento online:** conversa dentro de cada chamado, com o botão "Conversas" no topo avisando quando há mensagem nova.
- **Ciclo de vida controlado:** o operador resolve e reabre; só o administrador fecha e, depois de fechado, só ele altera o chamado.
- **Ações em lote:** selecionar chamados um a um ou todos os do filtro e resolver ou fechar com uma única justificativa.
- **Pedido de reabertura** pelo solicitante, com justificativa, aceito ou recusado pelo atendimento.
- **Notificações assíncronas** ao solicitante, via RabbitMQ, em cada etapa.

Capturas de cada tela: [docs/telas](docs/telas/).

## Arquitetura em resumo

| Camada | Componente | Tecnologia |
|---|---|---|
| Frontend | SPA + gateway de API | React (Vite) servido por nginx |
| Backend | `ticket-service` (chamados, conversa, contas e login) | Node.js 22 + Express |
| Backend | `notification-service` (notificações) | Node.js 22 + Express, consumidor de fila |
| Mensageria | Eventos de chamado (`ticket.created`, `ticket.status_changed`, `ticket.message_added`, `ticket.reopen_*`) | RabbitMQ (exchange topic, fila durável, DLQ) |
| Banco de dados | Contas, chamados, conversas e notificações | PostgreSQL 16 |
| Observabilidade | Métricas, logs, dashboards e alertas | Prometheus, Loki, Promtail, Grafana |
| Orquestração | Local, sem custo | Docker Compose ou Kubernetes (kind) |
| IaC | Cluster e stack de observabilidade | Terraform |

O desenho completo, os fluxos e o detalhamento de alta disponibilidade, monitoramento e observabilidade estão em **[docs/arquitetura/README.md](docs/arquitetura/README.md)**.

## Onde está cada entrega

| # | Entrega | Local |
|---|---|---|
| 0 | RACI | [docs/RACI.md](docs/RACI.md) |
| 1 | Desenho e detalhamento da arquitetura | [docs/arquitetura/README.md](docs/arquitetura/README.md) |
| 2 | Código da aplicação | [app/](app/) |
| 3 | Infraestrutura como código | [infra/aws/](infra/aws/) (nuvem), [infra/terraform/](infra/terraform/), [infra/k8s/](infra/k8s/), [docker-compose.yml](docker-compose.yml) |
| 4 | Logs e eventos da aplicação | [docs/evidencias/logs/](docs/evidencias/) |
| 5 | Print do dashboard | [docs/evidencias/dashboards/](docs/evidencias/) |
| 6 | Apresentação | [docs/apresentacao/](docs/apresentacao/) |

## Como executar

### Opção A — Docker Compose (mais simples)

Pré-requisito: Docker com o plugin Compose. No Windows, basta o Docker Desktop com o backend WSL 2; os comandos `docker compose` rodam no PowerShell e os scripts `.sh` rodam com `wsl -d Ubuntu bash ./scripts/<nome>.sh` (é preciso ter o Ubuntu instalado no WSL).

```bash
docker compose up -d --build
./scripts/gerar-carga.sh 100        # gera chamados, conversas e mudanças de status com as contas de demonstração
```

| Serviço | URL | Acesso |
|---|---|---|
| Aplicação | http://localhost:8080 | contas na seção "Perfis de acesso" |
| Grafana | http://localhost:3000 | admin / admin |
| Prometheus | http://localhost:9090 | — |
| RabbitMQ | http://localhost:15672 | helpdesk / helpdesk |

Se a porta 3000 já estiver em uso na máquina, crie um arquivo `.env` na raiz com `GRAFANA_PORT=3001` e acesse o Grafana em http://localhost:3001.

Para encerrar: `docker compose down` (acrescente `-v` para apagar os dados).

### Opção B — Kubernetes local com Terraform (demonstra HA e escalabilidade)

Pré-requisitos: Docker, Terraform 1.6 ou superior, kind e kubectl.

```bash
./scripts/k8s-up.sh                 # terraform apply + build + deploy
./scripts/gerar-carga.sh 300
kubectl -n helpdesk get pods,hpa -o wide
./scripts/k8s-down.sh               # destrói tudo
```

As URLs são as mesmas da opção A (não rode as duas opções ao mesmo tempo, pois usam as mesmas portas).

### Opção C — Nuvem AWS (AWS Academy) com alta disponibilidade e deploy automático

O Terraform de [infra/aws](infra/aws/) cria um **Application Load Balancer** e **dois servidores de aplicação em zonas de disponibilidade diferentes**, mais um servidor de dados e observabilidade. Se um servidor de aplicação cair, o ALB manda o tráfego para o outro. O workflow [deploy-aws.yml](.github/workflows/deploy-aws.yml) roda os testes e atualiza os servidores **um de cada vez** a cada push na `main`. Passo a passo e testes de alta disponibilidade: [docs/AWS-ACADEMY.md](docs/AWS-ACADEMY.md).

```bash
cd infra/aws
terraform init
terraform apply -var="grafana_senha=<sua-senha>"
```

O endereço aparece no fim do `apply` (`endereco_aplicacao`). Os servidores só ficam ligados enquanto o Learner Lab estiver ativo (**Start Lab**).

### Testes automatizados

```bash
cd app/ticket-service && npm install && npm test
cd app/notification-service && npm install && npm test
```

## Estrutura do repositório

```
app/
  frontend/               React + nginx (frontend e gateway de API)
  ticket-service/         API de chamados, publica eventos
  notification-service/   consome eventos e registra notificações
infra/
  terraform/              cluster kind + metrics-server + Prometheus/Grafana + Loki
  k8s/                    manifestos da aplicação (Kustomize)
  observability/          configuração de Prometheus, Loki, Promtail e Grafana (Compose)
docs/
  RACI.md
  arquitetura/README.md
  evidencias/             logs e prints de dashboard
  apresentacao/           roteiro e slides
scripts/                  subir/derrubar o ambiente e gerar carga
docker-compose.yml
```

## Estado da validação

| Item | Situação |
|---|---|
| Testes unitários dos dois microsserviços (20 testes, incluindo login, permissões por perfil, ações em lote e reabertura) | Executados e aprovados |
| Build de produção do frontend | Executado |
| Ambiente Docker Compose completo (11 containers, duas réplicas de cada microsserviço) | Executado em 09/11/2026, no Windows com Docker Desktop |
| Fluxo de ponta a ponta pelo RabbitMQ (chamado → evento → notificação) | Validado |
| Prometheus (todos os alvos "UP"), dashboard do Grafana e logs no Loki | Validados — ver [docs/evidencias](docs/evidencias/) |
| Login, perfis, filtros, conversas, ações em lote e reabertura | Testados em navegador com PostgreSQL real; validação no Docker Compose pela checklist de [docs/evidencias](docs/evidencias/README.md) |
| `terraform apply` e deploy no Kubernetes (kind) | Código entregue, **ainda não executado** |
| Deploy na AWS (Terraform `infra/aws`) | Servidor único executado em 23/11/2026 no AWS Academy; versão com ALB e dois servidores de aplicação **a registrar** |
| Deploy contínuo (GitHub Actions `deploy-aws.yml`) | Testes e build a cada push; deploy gradual (dados → app-a → app-b) depois de cadastrar os segredos da AWS |

---

Desenvolvido por **Joaquim Luiz Vitória Junior** para a disciplina de Arquitetura de Computação em Nuvem, ministrada pelo professor Erik Rosa Filippini.
