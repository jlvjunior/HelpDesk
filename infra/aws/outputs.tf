output "endereco_aplicacao" {
  description = "Endereço público da aplicação (load balancer)"
  value       = "http://${aws_lb.helpdesk.dns_name}"
}

output "endereco_grafana" {
  description = "Grafana (usuário admin e a senha informada em grafana_senha)"
  value       = "http://${aws_eip.dados.public_ip}:3000"
}

output "ip_dados" {
  description = "IP público do servidor de dados e observabilidade"
  value       = aws_eip.dados.public_ip
}

output "ip_app_a" {
  description = "IP público do servidor de aplicação A (zona a)"
  value       = aws_eip.app[0].public_ip
}

output "ip_app_b" {
  description = "IP público do servidor de aplicação B (zona b)"
  value       = aws_eip.app[1].public_ip
}

output "segredos_github" {
  description = "Valores para Settings → Secrets and variables → Actions (mais AWS_EC2_SSH_KEY = conteúdo do labsuser.pem)"
  value = {
    AWS_HOST_DADOS = aws_eip.dados.public_ip
    AWS_HOST_APP_A = aws_eip.app[0].public_ip
    AWS_HOST_APP_B = aws_eip.app[1].public_ip
    AWS_ALB_DNS    = aws_lb.helpdesk.dns_name
  }
}

output "atalhos_ssh" {
  description = "Cole no terminal do laboratório para criar os atalhos de acesso"
  value       = <<-EOT
    alias hd-dados='ssh -i ~/.ssh/labsuser.pem -o StrictHostKeyChecking=no ec2-user@${aws_eip.dados.public_ip}'
    alias hd-a='ssh -i ~/.ssh/labsuser.pem -o StrictHostKeyChecking=no ec2-user@${aws_eip.app[0].public_ip}'
    alias hd-b='ssh -i ~/.ssh/labsuser.pem -o StrictHostKeyChecking=no ec2-user@${aws_eip.app[1].public_ip}'
  EOT
}

output "alb_dns" {
  description = "Nome DNS do load balancer (para scripts)"
  value       = aws_lb.helpdesk.dns_name
}
