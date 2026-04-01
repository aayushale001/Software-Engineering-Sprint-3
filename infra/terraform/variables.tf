variable "project_name" {
  type        = string
  description = "Project name prefix for resources"
  default     = "hospital-platform"
}

variable "aws_region" {
  type        = string
  description = "Primary AWS region"
  default     = "eu-west-2"
}

variable "dr_region" {
  type        = string
  description = "Disaster recovery region"
  default     = "eu-west-1"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR"
  default     = "10.10.0.0/16"
}
