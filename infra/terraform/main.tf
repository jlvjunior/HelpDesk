# Infraestrutura local como código:
#   - cluster Kubernetes (kind) com 1 control-plane e N workers
#   - metrics-server (necessário para o HPA)
#   - kube-prometheus-stack (Prometheus Operator, Prometheus, Alertmanager, Grafana)
#   - Loki + Promtail (logs)
# A aplicação é implantada em seguida com: kubectl apply -k ../k8s

resource "kind_cluster" "this" {
  name           = var.cluster_name
  wait_for_ready = true

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    node {
      role = "control-plane"

      # NodePorts expostos em localhost
      extra_port_mappings {
        container_port = 30080
        host_port      = var.frontend_port
      }
      extra_port_mappings {
        container_port = 30030
        host_port      = var.grafana_port
      }
      extra_port_mappings {
        container_port = 30090
        host_port      = var.prometheus_port
      }
    }

    dynamic "node" {
      for_each = range(var.worker_nodes)
      content {
        role = "worker"
      }
    }
  }
}

provider "kubernetes" {
  host                   = kind_cluster.this.endpoint
  cluster_ca_certificate = kind_cluster.this.cluster_ca_certificate
  client_certificate     = kind_cluster.this.client_certificate
  client_key             = kind_cluster.this.client_key
}

provider "helm" {
  kubernetes {
    host                   = kind_cluster.this.endpoint
    cluster_ca_certificate = kind_cluster.this.cluster_ca_certificate
    client_certificate     = kind_cluster.this.client_certificate
    client_key             = kind_cluster.this.client_key
  }
}

resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
  }
}

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = "3.12.2"
  namespace  = "kube-system"

  # O kubelet do kind usa certificado autoassinado.
  set {
    name  = "args[0]"
    value = "--kubelet-insecure-tls"
  }
}

resource "helm_release" "kube_prometheus_stack" {
  name       = "monitoring"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = "67.9.0"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  timeout    = 900

  values = [file("${path.module}/values/kube-prometheus-stack.yaml")]

  set_sensitive {
    name  = "grafana.adminPassword"
    value = var.grafana_admin_password
  }
}

resource "helm_release" "loki" {
  name       = "loki"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki-stack"
  version    = "2.10.2"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  timeout    = 600

  values = [file("${path.module}/values/loki-stack.yaml")]
}
