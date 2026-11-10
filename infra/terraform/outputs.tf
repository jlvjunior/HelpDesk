output "cluster_name" {
  value = kind_cluster.this.name
}

output "kubeconfig_path" {
  value = kind_cluster.this.kubeconfig_path
}

output "frontend_url" {
  value = "http://localhost:${var.frontend_port}"
}

output "grafana_url" {
  value = "http://localhost:${var.grafana_port}"
}

output "prometheus_url" {
  value = "http://localhost:${var.prometheus_port}"
}
