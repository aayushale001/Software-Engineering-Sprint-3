# Terraform Infrastructure

This folder provides an AWS-oriented baseline for:

- EKS cluster for stateless microservices
- Aurora PostgreSQL (primary + reader)
- ElastiCache Redis replication group
- MSK Kafka cluster
- AWS Backup vault and cross-region copy for DR

## Usage

```bash
cd infra/terraform
terraform init
terraform plan -var='project_name=hospital-platform'
terraform apply -var='project_name=hospital-platform'
```

## Notes

- Replace static Aurora credentials in `modules/data/main.tf` with AWS Secrets Manager integration before production.
- Add IAM policy attachments for EKS and backup roles per your organization baseline.
- Add VPC routing/NAT/security groups for private-only service access.
