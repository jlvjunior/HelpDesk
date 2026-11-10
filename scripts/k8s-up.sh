#!/usr/bin/env bash
# Sobe o ambiente Kubernetes local completo: cluster + observabilidade (Terraform) e aplicação (kubectl).
# Pré-requisitos: docker, terraform, kind, kubectl.
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER="${CLUSTER_NAME:-helpdesk}"
TAG=1.0.0

echo ">> 1/4 Provisionando cluster e observabilidade com Terraform"
terraform -chdir=infra/terraform init -input=false
terraform -chdir=infra/terraform apply -auto-approve -input=false -var "cluster_name=${CLUSTER}"

echo ">> 2/4 Construindo as imagens"
for svc in ticket-service notification-service frontend; do
  docker build -t "helpdesk/${svc}:${TAG}" "app/${svc}"
done

echo ">> 3/4 Carregando as imagens no cluster kind"
for svc in ticket-service notification-service frontend; do
  kind load docker-image "helpdesk/${svc}:${TAG}" --name "${CLUSTER}"
done

echo ">> 4/4 Implantando a aplicação"
kubectl --context "kind-${CLUSTER}" apply -k infra/k8s
for d in ticket-service notification-service frontend; do
  kubectl --context "kind-${CLUSTER}" -n helpdesk rollout status "deploy/${d}" --timeout=300s
done

echo
echo "Frontend:   http://localhost:8080"
echo "Grafana:    http://localhost:3000  (admin / admin)"
echo "Prometheus: http://localhost:9090"
