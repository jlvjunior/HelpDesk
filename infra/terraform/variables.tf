variable "cluster_name" {
  description = "Nome do cluster kind"
  type        = string
  default     = "helpdesk"
}

variable "worker_nodes" {
  description = "Quantidade de nós worker (2 ou mais para demonstrar alta disponibilidade)"
  type        = number
  default     = 2
}

variable "frontend_port" {
  description = "Porta local do frontend"
  type        = number
  default     = 8080
}

variable "grafana_port" {
  description = "Porta local do Grafana"
  type        = number
  default     = 3000
}

variable "prometheus_port" {
  description = "Porta local do Prometheus"
  type        = number
  default     = 9090
}

variable "grafana_admin_password" {
  description = "Senha do usuário admin do Grafana"
  type        = string
  default     = "admin"
  sensitive   = true
}
