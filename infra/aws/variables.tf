variable "regiao" {
  description = "Região da AWS (o Learner Lab libera us-east-1 e us-west-2)"
  type        = string
  default     = "us-east-1"
}

variable "zonas" {
  description = "Duas zonas de disponibilidade: um servidor de aplicação em cada"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "repositorio" {
  description = "Repositório público do GitHub que os servidores clonam (usuario/repositorio)"
  type        = string
  default     = "jlvjunior/HelpDesk"
}

variable "servidores_app" {
  description = "Quantos servidores de aplicação atrás do load balancer. 1 = um servidor faz tudo (limite do AWS Academy desta turma: uma instância por vez). 2 = alta disponibilidade entre zonas, com servidor de dados separado"
  type        = number
  default     = 1

  validation {
    condition     = contains([1, 2], var.servidores_app)
    error_message = "Use 1 (um servidor) ou 2 (alta disponibilidade entre zonas)."
  }
}

variable "tipo_instancia_unico" {
  description = "Tamanho do servidor quando servidores_app = 1 (ele roda aplicação, dados e observabilidade)"
  type        = string
  default     = "t3.large"
}

variable "tipo_instancia_app" {
  description = "Tamanho dos dois servidores de aplicação (o Learner Lab aceita até 'large')"
  type        = string
  default     = "t3.medium"
}

variable "tipo_instancia_dados" {
  description = "Tamanho do servidor de dados e observabilidade"
  type        = string
  default     = "t3.medium"
}

variable "chave_ssh" {
  description = "Par de chaves já existente no Learner Lab (o PEM é baixado em AWS Details)"
  type        = string
  default     = "vockey"
}

variable "perfil_instancia" {
  description = "Perfil IAM pronto do Learner Lab (não é permitido criar papéis IAM)"
  type        = string
  default     = "LabInstanceProfile"
}

variable "grafana_senha" {
  description = "Senha do usuário admin do Grafana na nuvem"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[A-Za-z0-9@#%+=_.-]{8,64}$", var.grafana_senha))
    error_message = "Use de 8 a 64 caracteres: letras, números e @ # % + = _ . -"
  }
}

variable "ip_admin" {
  description = "Seu IP no formato 1.2.3.4/32 para liberar Prometheus (9090) e RabbitMQ (15672). Vazio = fechados"
  type        = string
  default     = ""
}
