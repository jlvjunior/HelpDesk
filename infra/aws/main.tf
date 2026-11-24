# HelpDesk Cloud na AWS (AWS Academy Learner Lab) com alta disponibilidade na camada de aplicação.
#
#                      Internet
#                         │ :80
#           Application Load Balancer (2 zonas)
#              ┌──────────┴──────────┐
#      EC2 app-a (zona a)     EC2 app-b (zona b)     ← frontend + 2 réplicas de cada microsserviço
#              └──────────┬──────────┘
#            EC2 dados (PostgreSQL, RabbitMQ, Prometheus, Loki, Grafana)
#
# O ALB verifica a saúde de cada servidor a cada 10 s e para de mandar tráfego para quem
# falhar duas vezes seguidas: a queda de um servidor (ou de uma zona) não tira a aplicação do ar.
#
# servidores_app = 2 cria exatamente o desenho acima. servidores_app = 1 (padrão) cria um único
# servidor que faz tudo, atrás do mesmo ALB: o AWS Academy desta turma só mantém uma instância
# EC2 ligada por vez (as demais são terminadas pelo robô do laboratório, conferido no CloudTrail).

data "aws_vpc" "padrao" {
  default = true
}

# Sub-rede padrão de cada zona de disponibilidade.
data "aws_subnet" "zona" {
  count             = length(var.zonas)
  vpc_id            = data.aws_vpc.padrao.id
  availability_zone = var.zonas[count.index]
  default_for_az    = true
}

# Amazon Linux 2023, imagem oficial da Amazon (o Learner Lab só aceita AMIs da Amazon).
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

locals {
  unico = var.servidores_app == 1
  # IPs privados fixos: cada servidor já nasce sabendo onde estão os outros.
  ip_apps = slice([for s in data.aws_subnet.zona : cidrhost(s.cidr_block, 201)], 0, var.servidores_app)
  # Com um servidor só, ele mesmo é o "servidor de dados".
  ip_dados = local.unico ? local.ip_apps[0] : cidrhost(data.aws_subnet.zona[0].cidr_block, 200)
  nomes    = ["app-a", "app-b"]
}

# Segredos gerados aqui, nunca escritos no código: tokens de login, banco e fila.
resource "random_password" "jwt" {
  length  = 48
  special = false
}
resource "random_password" "banco" {
  length  = 24
  special = false
}
resource "random_password" "fila" {
  length  = 24
  special = false
}

# ---------- Grupos de segurança (firewall) ----------

resource "aws_security_group" "alb" {
  name        = "helpdesk-alb"
  description = "HelpDesk Cloud: entrada publica do load balancer"
  vpc_id      = data.aws_vpc.padrao.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "app" {
  name        = "helpdesk-app"
  description = "HelpDesk Cloud: servidores de aplicacao"
  vpc_id      = data.aws_vpc.padrao.id

  ingress {
    description     = "Trafego vindo apenas do load balancer"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  # SSH só com a chave do laboratório. Aberto porque o GitHub Actions publica
  # as atualizações a partir de endereços que mudam a cada execução.
  ingress {
    description = "SSH (somente chave)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "dados" {
  name        = "helpdesk-dados"
  description = "HelpDesk Cloud: banco, fila e observabilidade"
  vpc_id      = data.aws_vpc.padrao.id

  # PostgreSQL (5432), RabbitMQ (5672) e Loki (3100): só os servidores de aplicação.
  dynamic "ingress" {
    for_each = [3100, 5432, 5672]
    content {
      description     = "Porta ${ingress.value} so dos servidores de aplicacao"
      from_port       = ingress.value
      to_port         = ingress.value
      protocol        = "tcp"
      security_groups = [aws_security_group.app.id]
    }
  }
  ingress {
    description = "Grafana (protegido por senha)"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "SSH (somente chave)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  dynamic "ingress" {
    for_each = var.ip_admin == "" ? [] : [9090, 15672]
    content {
      description = "Administracao (Prometheus/RabbitMQ) so do IP do administrador"
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = [var.ip_admin]
    }
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# O Prometheus central lê o Prometheus de cada servidor de aplicação (federação).
resource "aws_security_group_rule" "app_metricas" {
  type                     = "ingress"
  description              = "Federacao do Prometheus central"
  from_port                = 9091
  to_port                  = 9091
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.dados.id
}

# ---------- Servidores ----------

resource "aws_instance" "dados" {
  count                  = local.unico ? 0 : 1
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.tipo_instancia_dados
  key_name               = var.chave_ssh
  iam_instance_profile   = var.perfil_instancia
  subnet_id              = data.aws_subnet.zona[0].id
  private_ip             = local.ip_dados
  vpc_security_group_ids = [aws_security_group.dados.id]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/inicializacao.sh.tftpl", {
    papel         = "dados"
    nome          = "dados"
    repositorio   = var.repositorio
    ip_dados      = local.ip_dados
    ips_apps      = local.ip_apps
    espera        = 0
    jwt_secret    = random_password.jwt.result
    db_senha      = random_password.banco.result
    mq_senha      = random_password.fila.result
    grafana_senha = var.grafana_senha
  })
  user_data_replace_on_change = true

  tags = {
    Name  = "helpdesk-dados"
    Papel = "dados"
  }
}

resource "aws_instance" "app" {
  count                = var.servidores_app
  ami                  = data.aws_ami.amazon_linux.id
  instance_type        = local.unico ? var.tipo_instancia_unico : var.tipo_instancia_app
  key_name             = var.chave_ssh
  iam_instance_profile = var.perfil_instancia
  subnet_id            = data.aws_subnet.zona[count.index].id
  private_ip           = local.ip_apps[count.index]
  # Servidor único: recebe também as regras do servidor de dados (Grafana público).
  vpc_security_group_ids = local.unico ? [aws_security_group.app.id, aws_security_group.dados.id] : [aws_security_group.app.id]

  root_block_device {
    volume_size = local.unico ? 30 : 20
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/inicializacao.sh.tftpl", {
    papel         = local.unico ? "tudo" : "app"
    nome          = local.nomes[count.index]
    repositorio   = var.repositorio
    ip_dados      = local.ip_dados
    ips_apps      = local.ip_apps
    espera        = count.index * 90 # o segundo servidor espera o primeiro criar as tabelas
    jwt_secret    = random_password.jwt.result
    db_senha      = random_password.banco.result
    mq_senha      = random_password.fila.result
    grafana_senha = local.unico ? var.grafana_senha : ""
  })
  user_data_replace_on_change = true

  tags = {
    Name  = "helpdesk-${local.nomes[count.index]}"
    Papel = "app"
  }
}

# IPs públicos fixos para o SSH do GitHub Actions: não mudam quando o laboratório religa os servidores.
resource "aws_eip" "dados" {
  count    = local.unico ? 0 : 1
  instance = aws_instance.dados[0].id
  domain   = "vpc"
  tags     = { Name = "helpdesk-dados" }
}

resource "aws_eip" "app" {
  count    = var.servidores_app
  instance = aws_instance.app[count.index].id
  domain   = "vpc"
  tags     = { Name = "helpdesk-${local.nomes[count.index]}" }
}

# ---------- Load balancer ----------

resource "aws_lb" "helpdesk" {
  name               = "helpdesk-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnet.zona[*].id
}

resource "aws_lb_target_group" "app" {
  name                 = "helpdesk-app"
  port                 = 8080
  protocol             = "HTTP"
  vpc_id               = data.aws_vpc.padrao.id
  deregistration_delay = 15

  # A verificação passa pelo nginx até o ticket-service: a API responde 401 sem login.
  # Se o nginx ou o microsserviço cair, a resposta muda (502/timeout) e o servidor sai do balanceamento.
  health_check {
    path                = "/api/tickets"
    matcher             = "401"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

resource "aws_lb_target_group_attachment" "app" {
  count            = var.servidores_app
  target_group_arn = aws_lb_target_group.app.arn
  target_id        = aws_instance.app[count.index].id
  port             = 8080
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.helpdesk.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
