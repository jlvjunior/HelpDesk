variable "regiao" {
  description = "Região da AWS (o Learner Lab libera us-east-1 e us-west-2)"
  type        = string
  default     = "us-east-1"
}

variable "repositorio" {
  description = "Repositório público do GitHub que o servidor clona (usuario/repositorio)"
  type        = string
  default     = "jlvjunior/HelpDesk"
}

variable "tipo_instancia" {
  description = "Tamanho da máquina. O Learner Lab aceita até 'large'; a pilha completa (11 containers) precisa de ~6 GB"
  type        = string
  default     = "t3.large"
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
