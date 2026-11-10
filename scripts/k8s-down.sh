#!/usr/bin/env bash
# Destrói o cluster local e tudo o que foi criado pelo Terraform.
set -euo pipefail
cd "$(dirname "$0")/.."
terraform -chdir=infra/terraform destroy -auto-approve -input=false
