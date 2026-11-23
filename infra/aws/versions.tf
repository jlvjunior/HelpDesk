terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6"
    }
  }
}

# No AWS Academy Learner Lab, as credenciais já estão configuradas no terminal do laboratório
# (~/.aws/credentials) e a única região liberada para EC2 é us-east-1 (ou us-west-2).
provider "aws" {
  region = var.regiao

  default_tags {
    tags = {
      Projeto       = "HelpDesk Cloud"
      Autor         = "Joaquim Luiz Vitoria Junior"
      Disciplina    = "Arquitetura de Computacao em Nuvem"
      GerenciadoPor = "Terraform"
    }
  }
}
