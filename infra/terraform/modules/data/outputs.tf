output "aurora_cluster_arn" {
  value = aws_rds_cluster.aurora.arn
}

output "aurora_endpoint" {
  value = aws_rds_cluster.aurora.endpoint
}

output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "msk_bootstrap_brokers" {
  value = aws_msk_cluster.kafka.bootstrap_brokers_tls
}

output "backup_role_arn" {
  value = aws_iam_role.backup.arn
}
