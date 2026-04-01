# Kubernetes Deployment

Base manifests are in `deploy/k8s/base`.

## Apply

```bash
kubectl apply -k deploy/k8s/base
```

## Includes

- Namespace, config map, secret template
- Deployments/services/HPAs for each microservice
- Kong Gateway deployment + service

## Production hardening checklist

- Replace `platform-secrets` with external secret manager integration.
- Add service mesh mTLS and network policies.
- Add PodDisruptionBudgets and topology spread constraints.
- Configure ingress with AWS ALB + WAF.
