output "vpc_id" {
  value = module.network.vpc_id
}

output "eks_cluster_name" {
  value = module.eks.cluster_name
}

output "aurora_cluster_endpoint" {
  value = module.data.aurora_endpoint
}

output "redis_primary_endpoint" {
  value = module.data.redis_primary_endpoint
}

output "msk_bootstrap_brokers" {
  value = module.data.msk_bootstrap_brokers
}
