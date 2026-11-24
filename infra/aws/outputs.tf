output "endereco_aplicacao" {
  description = "Endereço público da aplicação (load balancer)"
  value       = "http://${aws_lb.helpdesk.dns_name}"
}

locals {
  ip_publico_dados = local.unico ? aws_eip.app[0].public_ip : one(aws_eip.dados[*].public_ip)
  ip_publico_b     = try(aws_eip.app[1].public_ip, "")
}

output "endereco_grafana" {
  description = "Grafana (usuário admin e a senha informada em grafana_senha)"
  value       = "http://${local.ip_publico_dados}:3000"
}

output "ip_dados" {
  description = "IP público do servidor de dados e observabilidade (o mesmo do app-a com um servidor só)"
  value       = local.ip_publico_dados
}

output "ip_app_a" {
  description = "IP público do servidor de aplicação A (zona a)"
  value       = aws_eip.app[0].public_ip
}

output "ip_app_b" {
  description = "IP público do servidor de aplicação B (zona b); vazio com um servidor só"
  value       = local.ip_publico_b
}

output "segredos_github" {
  description = "Valores para Settings → Secrets and variables → Actions (mais AWS_EC2_SSH_KEY = conteúdo do labsuser.pem)"
  value = {
    AWS_HOST_DADOS = local.ip_publico_dados
    AWS_HOST_APP_A = aws_eip.app[0].public_ip
    AWS_HOST_APP_B = local.ip_publico_b == "" ? "(não cadastrar com um servidor só)" : local.ip_publico_b
    AWS_ALB_DNS    = aws_lb.helpdesk.dns_name
  }
}

output "atalhos_ssh" {
  description = "Cole no terminal do laboratório para criar os atalhos de acesso"
  value = join("\n", compact([
    "alias hd-dados='ssh -i ~/.ssh/labsuser.pem -o StrictHostKeyChecking=no ec2-user@${local.ip_publico_dados}'",
    "alias hd-a='ssh -i ~/.ssh/labsuser.pem -o StrictHostKeyChecking=no ec2-user@${aws_eip.app[0].public_ip}'",
    local.ip_publico_b == "" ? "" : "alias hd-b='ssh -i ~/.ssh/labsuser.pem -o StrictHostKeyChecking=no ec2-user@${local.ip_publico_b}'",
  ]))
}

output "alb_dns" {
  description = "Nome DNS do load balancer (para scripts)"
  value       = aws_lb.helpdesk.dns_name
}
