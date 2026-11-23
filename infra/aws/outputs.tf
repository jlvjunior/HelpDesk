output "endereco_aplicacao" {
  description = "Endereço público da aplicação"
  value       = "http://${aws_eip.helpdesk.public_ip}"
}

output "endereco_grafana" {
  description = "Grafana (usuário admin e a senha informada em grafana_senha)"
  value       = "http://${aws_eip.helpdesk.public_ip}:3000"
}

output "ip_publico" {
  description = "IP fixo do servidor: use no segredo AWS_EC2_HOST do GitHub"
  value       = aws_eip.helpdesk.public_ip
}

output "ssh" {
  description = "Comando para entrar no servidor pelo terminal do laboratório"
  value       = "ssh -i ~/.ssh/labsuser.pem ec2-user@${aws_eip.helpdesk.public_ip}"
}

output "acompanhar_instalacao" {
  description = "Mostra o andamento da instalação (leva de 5 a 10 minutos no primeiro boot)"
  value       = "ssh -i ~/.ssh/labsuser.pem ec2-user@${aws_eip.helpdesk.public_ip} 'sudo tail -f /var/log/helpdesk-inicializacao.log'"
}
