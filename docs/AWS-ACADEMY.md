# HelpDesk Cloud na AWS (AWS Academy Learner Lab) com alta disponibilidade

> **Limite desta turma:** o laboratório do AWS Academy usado na disciplina mantém **uma instância EC2 ligada por vez**. Na tentativa com três servidores (23/11/2026), o CloudTrail registrou o robô do laboratório (`sys3695465`) executando `TerminateInstances` em cada servidor extra 8 segundos depois da criação. Por isso, o padrão é `servidores_app = 1`: um servidor faz tudo, atrás do mesmo load balancer. O código para alta disponibilidade entre zonas (`servidores_app = 2`) está pronto e é o que se usaria numa conta sem essa restrição.

Passo a passo para deixar a aplicação online na AWS, com **load balancer e dois servidores de aplicação em zonas diferentes**, criada pelo Terraform e atualizada automaticamente pelo GitHub Actions.

## Como funciona (com `servidores_app = 2`)

```
                     Internet
                        │ :80
          Application Load Balancer (zonas a e b)
             ┌──────────┴──────────┐
     EC2 app-a (us-east-1a)  EC2 app-b (us-east-1b)    frontend + 2 réplicas de cada microsserviço
             └──────────┬──────────┘
     EC2 dados: PostgreSQL, RabbitMQ, Prometheus, Loki, Grafana
```

| Servidor | O que roda | Acesso |
|---|---|---|
| **ALB** (load balancer) | Distribui as requisições entre app-a e app-b; verifica a saúde de cada um a cada 10 s | Público, porta 80 |
| **app-a** e **app-b** | nginx (frontend), 2× ticket-service, 2× notification-service, Prometheus local e Promtail | Só o ALB (8080) e SSH |
| **dados** | PostgreSQL, RabbitMQ, Prometheus central (federação), Loki e Grafana | Grafana (3000) e SSH; banco, fila e Loki só para os servidores de aplicação |

**Alta disponibilidade:** se um servidor de aplicação (ou a zona dele) cair, o ALB percebe em cerca de 20 segundos e manda todo o tráfego para o outro. Os dados ficam no servidor de dados, então nada se perde. O servidor de dados continua único: em produção ele viraria RDS Multi-AZ e Amazon MQ (ver README de arquitetura).

**Deploy sem parar a aplicação:** o GitHub Actions atualiza um servidor de aplicação de cada vez; enquanto um reinicia, o outro atende.

**Com `servidores_app = 1` (padrão, compatível com o laboratório):** o load balancer continua na frente, mas aponta para um único servidor t3.large que roda a aplicação (2 réplicas de cada microsserviço), o banco, a fila e a observabilidade. A alta disponibilidade fica entre réplicas: se uma réplica cair, a outra atende. Passar para dois servidores é só mudar a variável.

**Importante sobre o Learner Lab:**

- Os servidores só ficam ligados enquanto o laboratório está ativo (sessões de até 4 horas). Quando a sessão acaba, eles desligam e voltam sozinhos no próximo **Start Lab**, com os mesmos IPs e os mesmos dados.
- **Nunca clique em Reset**: ele apaga tudo o que foi criado na conta.
- Custo aproximado: 3 servidores t3.medium + ALB ≈ US$ 0,20 por hora de laboratório ligado.

---

## Parte 1 — Enviar os arquivos para o GitHub (no seu PC)

```powershell
cd C:\HelpDesk
git add .
git commit -m "Alta disponibilidade na AWS: ALB e dois servidores de aplicação"
git push
```

## Parte 2 — Criar a infraestrutura (no terminal do laboratório)

1. No AWS Academy: **Start Lab** e espere a bolinha de **AWS** ficar verde.
2. Atualize as credenciais: **AWS Details → AWS CLI: Show**, copie o bloco e, no terminal:

   ```bash
   cat > ~/credenciais-aws
   ```
   Cole, aperte **Enter** e depois **Ctrl+D**. Então:
   ```bash
   chmod 600 ~/credenciais-aws
   export AWS_SHARED_CREDENTIALS_FILE=~/credenciais-aws
   export PATH=$HOME/bin:$PATH
   aws sts get-caller-identity
   ```
   Deve mostrar `Account` e `Arn`.

3. Atualize o projeto e aplique (troque pela sua senha do Grafana: 8 a 64 caracteres, letras, números e `@ # % + = _ . -`):

   ```bash
   cd ~/HelpDesk && git pull
   cd infra/aws
   terraform init -upgrade
   terraform apply -var="grafana_senha=SUA_SENHA"
   ```

   Isso cria a versão com **um servidor** atrás do load balancer. Para a versão com dois servidores de aplicação, numa conta sem o limite de uma instância, acrescente `-var="servidores_app=2"`. Digite **yes**. Em 3 a 5 minutos aparecem as saídas:

   ```
   endereco_aplicacao = "http://helpdesk-alb-123456789.us-east-1.elb.amazonaws.com"
   endereco_grafana   = "http://54.x.x.x:3000"
   segredos_github    = { AWS_ALB_DNS = "...", AWS_HOST_APP_A = "...", AWS_HOST_APP_B = "...", AWS_HOST_DADOS = "..." }
   atalhos_ssh        = <<EOT ... EOT
   ```

4. Crie os atalhos de acesso (copie as 3 linhas `alias` da saída `atalhos_ssh` e cole no terminal). Para ficarem salvos nas próximas sessões:

   ```bash
   terraform output -raw atalhos_ssh >> ~/.bashrc
   ```

5. Espere **8 a 12 minutos** enquanto o servidor instala o Docker e constrói as imagens. Para acompanhar:

   ```bash
   hd-a 'sudo tail -n 5 /var/log/helpdesk-inicializacao.log'
   ```

   Deve terminar em **HELPDESK PRONTO**. (Com dois servidores, confira também `hd-dados` e `hd-b`.)

6. Abra o `endereco_aplicacao` no navegador (pode levar mais 1 minuto para o ALB marcar os servidores como saudáveis) e o `endereco_grafana` (usuário `admin`).

## Parte 3 — Ligar o deploy automático (no GitHub)

1. No AWS Academy: **AWS Details → Download PEM** (arquivo `labsuser.pem`).
2. No GitHub: **Settings → Secrets and variables → Actions**. Apague o segredo antigo `AWS_EC2_HOST`, se existir, e crie:

   | Nome | Valor |
   |---|---|
   | `AWS_EC2_SSH_KEY` | conteúdo inteiro do `labsuser.pem` (se já existe, mantenha) |
   | `AWS_HOST_DADOS` | valor de `AWS_HOST_DADOS` na saída `segredos_github` |
   | `AWS_HOST_APP_A` | valor de `AWS_HOST_APP_A` |
   | `AWS_HOST_APP_B` | valor de `AWS_HOST_APP_B`; **não crie** com um servidor só |
   | `AWS_ALB_DNS` | valor de `AWS_ALB_DNS` (só o nome, sem `http://`) |

3. Teste: **Actions → CI/CD — HelpDesk Cloud na AWS → Run workflow**. As etapas: **🧪 Testes e build** → **🐳 Build das imagens** → **🚀 Deploy gradual na AWS** (dados → app-a → app-b → verificação pelo load balancer).

## Parte 4 — Testes de alta disponibilidade (ótimos para a apresentação)

Abra a aplicação pelo `endereco_aplicacao` e o Grafana lado a lado.

**Com um servidor (padrão no laboratório):** derrube uma réplica e mostre que a aplicação continua atendendo, inclusive o login:

```bash
hd-a 'docker kill helpdesk-ticket-service-1'
```

No Grafana, **Réplicas ticket-service no ar** cai de 2 para 1 e volta a 2 sozinha (o Docker reinicia a réplica). Os testes abaixo, de 1 a 4, valem para a versão com dois servidores.

**1. Ver o balanceamento:** gere carga e veja, no painel **Requisições por réplica (balanceamento)**, as 4 réplicas do ticket-service (2 em app-a, 2 em app-b) recebendo tráfego:

```bash
cd ~/HelpDesk && bash scripts/gerar-carga.sh 100 "http://$(cd infra/aws && terraform output -raw alb_dns)"
```

**2. Derrubar um servidor inteiro:**

```bash
hd-a 'cd /opt/helpdesk/deploy/aws/app && docker compose stop'
```

- A aplicação continua funcionando pelo mesmo endereço (o ALB tira o app-a do balanceamento em cerca de 20 s).
- No Grafana, **Réplicas ticket-service no ar** cai de 4 para 2, e o alerta `ServidorDeAplicacaoFora` aparece no Prometheus.

Para voltar:

```bash
hd-a 'cd /opt/helpdesk/deploy/aws/app && docker compose start'
```

**3. Desligar a máquina pelo console (queda real de servidor):** no console da AWS, **EC2 → Instâncias → helpdesk-app-b → Estado da instância → Interromper**. A aplicação segue no ar pelo app-a. Depois, **Iniciar** de novo: o app-b volta ao balanceamento sozinho.

**4. Deploy sem parar a aplicação:** altere um texto da tela, faça `git push` e, enquanto o GitHub Actions atualiza app-a e depois app-b, continue usando a aplicação.

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `InvalidClientTokenId` / `ExpiredToken` | Credenciais vencidas: refaça o passo 2 da Parte 2. |
| `terraform: command not found` | `export PATH=$HOME/bin:$PATH` |
| Erro ao criar o load balancer | Confirme que a região é `us-east-1` e que as zonas `us-east-1a` e `us-east-1b` existem (`aws ec2 describe-availability-zones`). Se uma não estiver disponível, rode o apply com `-var='zonas=["us-east-1a","us-east-1c"]'`. |
| Servidores extras ficam `terminated` segundos depois de criados (`Client.UserInitiatedShutdown`) | É o limite de uma instância por vez do laboratório. Use `servidores_app = 1` (padrão). Para conferir: `aws cloudtrail lookup-events --lookup-attributes AttributeKey=ResourceName,AttributeValue=<id da instância>` mostra `TerminateInstances` feito pelo robô do laboratório. |
| Erro dizendo que o IP privado está em uso | Outro recurso usa o endereço `.200`/`.201` da sub-rede. Me avise para trocar os números em `main.tf`. |
| ALB responde **502/503** | Os servidores ainda estão instalando (veja o log da Parte 2, passo 5) ou o servidor de dados ainda não subiu. |
| Deploy do GitHub: "Não consegui conectar" | O laboratório está desligado: **Start Lab** e **Run workflow** de novo. |

## Remover tudo (depois da nota)

```bash
cd ~/HelpDesk/infra/aws
terraform destroy -var="grafana_senha=SUA_SENHA"
```
