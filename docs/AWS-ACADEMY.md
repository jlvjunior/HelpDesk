# HelpDesk Cloud na AWS (AWS Academy Learner Lab)

Passo a passo para deixar a aplicação online na AWS, criada pelo Terraform e atualizada automaticamente pelo GitHub Actions.

**Como funciona:** o Terraform (`infra/aws`) cria um servidor EC2 com IP fixo. No primeiro boot, o servidor instala o Docker, clona este repositório e sobe tudo com Docker Compose. Depois, a cada `git push` na `main`, o GitHub Actions roda os testes e atualiza o servidor por SSH.

**Importante sobre o Learner Lab:**

- O servidor só fica ligado enquanto o laboratório está ativo (sessão de até 4 horas). Quando a sessão acaba, ele é desligado e volta sozinho no próximo **Start Lab**, com o mesmo IP e os mesmos dados.
- **Nunca clique em Reset**: ele apaga tudo o que foi criado na conta.
- O custo sai do crédito do laboratório (a t3.large custa poucos centavos de dólar por hora ligada).

---

## Parte 1 — Enviar os arquivos novos para o GitHub (no seu PC)

O servidor clona o repositório do GitHub, então os arquivos de `infra/aws` e o `docker-compose.aws.yml` precisam estar lá antes.

```powershell
git add .
git commit -m "Deploy na AWS com Terraform e GitHub Actions"
git push
```

## Parte 2 — Criar a infraestrutura (no terminal do laboratório)

1. No AWS Academy, abra **Laboratório de aprendizagem → Iniciar os laboratórios**, clique em **Start Lab** e espere a bolinha ao lado de **AWS** ficar **verde**.
2. Clique na área preta (o terminal do laboratório). As credenciais da AWS já estão configuradas nele.
3. Instale o Terraform (só na primeira vez):

   ```bash
   mkdir -p ~/bin && cd ~/bin
   curl -fsSLO https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_linux_amd64.zip
   unzip -o terraform_1.9.8_linux_amd64.zip && rm terraform_1.9.8_linux_amd64.zip
   echo 'export PATH=$HOME/bin:$PATH' >> ~/.bashrc && export PATH=$HOME/bin:$PATH
   terraform version
   ```

4. Baixe o projeto:

   ```bash
   cd ~ && git clone https://github.com/jlvjunior/HelpDesk.git
   cd ~/HelpDesk/infra/aws
   ```

5. Crie a infraestrutura. Troque `MinhaSenhaGrafana2026` por uma senha sua (8 a 64 caracteres: letras, números e `@ # % + = _ . -`):

   ```bash
   terraform init
   terraform apply -var="grafana_senha=MinhaSenhaGrafana2026"
   ```

   Confira a lista do que será criado e digite **yes**. Em cerca de 1 minuto aparecem as saídas:

   ```
   endereco_aplicacao = "http://54.x.x.x"
   endereco_grafana   = "http://54.x.x.x:3000"
   ip_publico         = "54.x.x.x"
   ```

   Anote o **ip_publico**. Para ver de novo depois: `terraform output`.

6. Espere de **5 a 10 minutos**: o servidor está instalando o Docker e construindo as imagens. Para acompanhar (opcional):

   ```bash
   ssh -i ~/.ssh/labsuser.pem -o StrictHostKeyChecking=accept-new ec2-user@<ip_publico> 'sudo tail -f /var/log/helpdesk-inicializacao.log'
   ```

   Quando aparecer **HELPDESK PRONTO**, aperte Ctrl+C. Se o arquivo `~/.ssh/labsuser.pem` não existir no terminal, pule este passo e só espere os 10 minutos.

7. Abra no navegador:
   - Aplicação: `http://<ip_publico>`, com as contas de demonstração do README;
   - Grafana: `http://<ip_publico>:3000`, usuário `admin` e a senha do passo 5.

> O Terraform guarda o estado (`terraform.tfstate`) na pasta `~/HelpDesk/infra/aws` do terminal do laboratório, que é mantida entre as sessões. Não apague essa pasta: é ela que permite alterar ou destruir a infraestrutura depois.

## Parte 3 — Ligar o deploy automático (no GitHub)

1. No AWS Academy, clique em **AWS Details** → ao lado de **SSH key**, clique em **Download PEM**. O arquivo `labsuser.pem` vai para a pasta Downloads.
2. Abra o `labsuser.pem` no Bloco de Notas e copie **todo** o conteúdo, inclusive as linhas `-----BEGIN RSA PRIVATE KEY-----` e `-----END RSA PRIVATE KEY-----`.
3. No GitHub, abra o repositório HelpDesk → **Settings → Secrets and variables → Actions → New repository secret** e crie:

   | Nome | Valor |
   |---|---|
   | `AWS_EC2_HOST` | o `ip_publico` (só os números, ex.: `54.12.34.56`) |
   | `AWS_EC2_SSH_KEY` | o conteúdo do `labsuser.pem` |

4. Teste: **Actions → CI/CD — HelpDesk Cloud na AWS → Run workflow**. As etapas são:
   **🧪 Testes e build** → **🐳 Build das imagens Docker** → **🚀 Deploy na AWS**.
   No fim, o resumo mostra o endereço da aplicação.

A partir daí, todo `git push` na `main` (fora mudanças só em documentação) testa e atualiza o servidor sozinho.

> Não compartilhe o `labsuser.pem` nem cole o conteúdo dele em chat ou e-mail: ele dá acesso ao servidor.

## Parte 4 — Dia da apresentação

1. Uns 10 minutos antes: **Start Lab** e espere a bolinha verde. O servidor religa sozinho e os containers sobem em 2 a 3 minutos.
2. Abra `http://<ip_publico>` e o Grafana. Se quiser dados no dashboard, gere carga a partir do seu PC (WSL):

   ```bash
   wsl -d Ubuntu bash ./scripts/gerar-carga.sh 100 http://<ip_publico>
   ```

3. Demonstração extra: altere um texto da tela, faça `git push` e mostre o GitHub Actions atualizando a nuvem.
4. Ao terminar: **End Lab**, para economizar crédito.

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `terraform: command not found` | Rode `export PATH=$HOME/bin:$PATH` ou repita o passo 3 da Parte 2. |
| Erro `UnauthorizedOperation` ou `ExpiredToken` no Terraform | A sessão do laboratório expirou. Clique em **Start Lab** e rode o comando de novo. |
| Erro dizendo que a chave `vockey` não existe | Confirme que a região é `us-east-1` (padrão do projeto). |
| O site não abre depois de 10 minutos | Veja o log (passo 6 da Parte 2). Se o servidor acabou de religar, espere mais 3 minutos. |
| Deploy do GitHub falha com "Não consegui conectar ao servidor" | O laboratório está desligado. **Start Lab** e **Run workflow** de novo. |
| Grafana não aceita a senha | O usuário é `admin`. A senha é a do `terraform apply`. |

## Remover tudo (depois da nota)

No terminal do laboratório:

```bash
cd ~/HelpDesk/infra/aws
terraform destroy -var="grafana_senha=MinhaSenhaGrafana2026"
```
