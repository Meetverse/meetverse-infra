import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export class NginxChart extends pulumi.ComponentResource {
  annotations: Record<string, string>;
  release: k8s.helm.v3.Release;

  constructor(provider: k8s.Provider) {
    super("MarzoAI:Cluster:Helm:Nginx", "nginx-chart");
    const appLabels = {
      app: "nginx-ingress"
    };

    const ingressNs = new k8s.core.v1.Namespace(
      "ingressns",
      {
        metadata: {
          labels: appLabels,
          name: "default"
        }
      },
      { provider: provider }
    );

    this.release = new k8s.helm.v3.Release(
      "ingresscontroller",
      {
        chart: "ingress-nginx",
        namespace: ingressNs.metadata.name,
        repositoryOpts: {
          repo: "https://kubernetes.github.io/ingress-nginx"
        },
        skipCrds: true,
        values: {
          controller: {
            admissionWebhooks: {
              enabled: false
            },
            enableCustomResources: false,
            appprotect: {
              enable: false
            },
            appprotectdos: {
              enable: false
            },
            service: {
              extraLabels: appLabels
            }
          }
        }
      },
      { provider: provider }
    );
    const cfg = new pulumi.Config();
    const apiKey = cfg.get("gdapiKey");
    if (apiKey && apiKey !== "") {
      this.annotations = {
        "cert-manager.io/cluster-issuer": "letsencrypt-prod-dns",
        "kubernetes.io/ingress.class": "nginx",
        "cert-manager.io/issue-temporary-certificate": "true",
        "nginx.ingress.kubernetes.io/proxy-body-size": "512m",
        "nginx.ingress.kubernetes.io/proxy-connect-timeout": "10",
        "nginx.ingress.kubernetes.io/proxy-read-timeout": "300"
      };
    } else {
      this.annotations = {
        "cert-manager.io/cluster-issuer": "letsencrypt-prod-http",
        "kubernetes.io/ingress.class": "nginx",
        "cert-manager.io/issue-temporary-certificate": "true",
        "nginx.ingress.kubernetes.io/proxy-body-size": "512m",
        "nginx.ingress.kubernetes.io/proxy-connect-timeout": "10",
        "nginx.ingress.kubernetes.io/proxy-read-timeout": "300"
      };
    }
  }
}
