# HelpDesk Cloud na AWS (AWS Academy Learner Lab)
# Cria: grupo de segurança (firewall), servidor EC2 com Docker e IP público fixo (Elastic IP).
# Ao ligar pela primeira vez, o servidor instala o Docker, clona o repositório do GitHub
# e sobe toda a pilha com Docker Compose (aplicação + mensageria + observabilidade).

data "aws_vpc" "padrao" {
  default = true
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

# Segredo que assina os tokens de login: gerado aqui, nunca escrito no código.
resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "aws_security_group" "helpdesk" {
  name        = "helpdesk-cloud"
  description = "HelpDesk Cloud: web, Grafana e SSH"
  vpc_id      = data.aws_vpc.padrao.id

  ingress {
    description = "Aplicacao (HTTP)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Grafana (protegido por senha)"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH só com a chave do laboratório (sem senha). Aberto porque o GitHub Actions
  # publica as atualizações a partir de endereços que mudam a cada execução.
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

resource "aws_instance" "helpdesk" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.tipo_instancia
  key_name               = var.chave_ssh
  iam_instance_profile   = var.perfil_instancia
  vpc_security_group_ids = [aws_security_group.helpdesk.id]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/inicializacao.sh.tftpl", {
    repositorio   = var.repositorio
    jwt_secret    = random_password.jwt.result
    grafana_senha = var.grafana_senha
  })

  # Mudar o script de inicialização recria o servidor (ele só roda no primeiro boot).
  user_data_replace_on_change = true

  tags = {
    Name = "helpdesk-cloud"
  }
}

# IP público fixo: não muda quando o laboratório desliga e religa o servidor.
resource "aws_eip" "helpdesk" {
  instance = aws_instance.helpdesk.id
  domain   = "vpc"

  tags = {
    Name = "helpdesk-cloud"
  }
}
