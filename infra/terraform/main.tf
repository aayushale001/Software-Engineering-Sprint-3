module "network" {
  source       = "./modules/network"
  project_name = var.project_name
  vpc_cidr     = var.vpc_cidr
}

module "eks" {
  source             = "./modules/eks"
  project_name       = var.project_name
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
}

module "data" {
  source             = "./modules/data"
  project_name       = var.project_name
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
}

resource "aws_backup_vault" "primary" {
  name = "${var.project_name}-backup-vault"
}

resource "aws_backup_plan" "hospital" {
  name = "${var.project_name}-backup-plan"

  rule {
    rule_name         = "daily-rds-backup"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(0 2 * * ? *)"

    lifecycle {
      cold_storage_after = 30
      delete_after       = 365
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn
      lifecycle {
        cold_storage_after = 30
        delete_after       = 365
      }
    }
  }
}

resource "aws_backup_vault" "dr" {
  provider = aws.dr
  name     = "${var.project_name}-dr-backup-vault"
}

resource "aws_backup_selection" "rds_selection" {
  iam_role_arn = module.data.backup_role_arn
  name         = "${var.project_name}-rds-selection"
  plan_id      = aws_backup_plan.hospital.id

  resources = [module.data.aurora_cluster_arn]
}
