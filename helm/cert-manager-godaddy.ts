import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as certmanager from "@pulumi/kubernetes-cert-manager";

/** Cert-manager + GoDaddy DNS-01 ClusterIssuer (wildcard-ready) */
export class CertDaddyManagerChart extends pulumi.ComponentResource {
  constructor(provider: k8s.Provider, adminEmail: string) {
    super("MarzoAI:Cluster:Helm:CertManager", "cert-manager-chart");

    /* ------------------------------------------------------------------ *
     * 1.  cert-manager itself (CRDs + controller pods)                   *
     * ------------------------------------------------------------------ */
    const cmNamespace = "cert-manager";

    /* 0️⃣  Create the namespace once */
    const ns = new k8s.core.v1.Namespace(
      cmNamespace,
      { metadata: { name: cmNamespace } },
      { provider: provider }
    );

    /* 3️⃣  cert-manager chart, re-using the pre-created SA */
    const cm = new certmanager.CertManager(
      "cert-manager",
      {
        installCRDs: true,
        helmOptions: {
          name: "cert-manager",
          namespace: cmNamespace,
          createNamespace: false, // we created it manually
          values: {
            serviceAccount: {
              create: true,
              name: "cert-manager"
            }
          }
        }
      },
      { provider: provider, dependsOn: [ns] }
    );

    /* GoDaddy webhook & ClusterIssuer keep using the same namespace */

    /* ------------------------------------------------------------------ *
     * 2.  GoDaddy production API credentials (pulumi config secrets)     *
     *     pulumi config set --secret godaddy:apiKey    ****              *
     *     pulumi config set --secret godaddy:apiSecret ****              *
     * ------------------------------------------------------------------ */
    const cfg = new pulumi.Config();
    const kk = cfg.get("gdapiKey");
    const ks = cfg.get("gdapiSecret");
    if (!kk || !ks) {
      throw new Error("GoDaddy API credentials not set. Please run:\n");
    }

    const godaddyCreds = new k8s.core.v1.Secret(
      "godaddy-api-creds",
      {
        metadata: { name: "godaddy-api-creds", namespace: "marzoai" },
        stringData: { token: `${kk}:${ks}` }
      },
      { provider, parent: this, dependsOn: cm }
    );

    const godaddyCreds2 = new k8s.core.v1.Secret(
      "godaddy-api-creds2",
      {
        metadata: { name: "godaddy-api-creds", namespace: cmNamespace },
        stringData: { token: `${kk}:${ks}` }
      },
      { provider, parent: this, dependsOn: cm }
    );

    /* ------------------------------------------------------------------ *
     * 3.  GoDaddy DNS-01 webhook (Helm chart)                            *
     * ------------------------------------------------------------------ */
    const webhook = new k8s.helm.v3.Release(
      "godaddy-webhook",
      {
        chart: "godaddy-webhook",
        version: "0.5.0",
        namespace: cmNamespace,
        repositoryOpts: {
          repo: "https://snowdrop.github.io/godaddy-webhook"
        },
        values: { groupName: "acme.godaddy.com" }
      },
      { provider, parent: this, dependsOn: cm }
    );

    /* ------------------------------------------------------------------ *
     * 4.  ClusterIssuer using DNS-01 via the webhook (wildcard-capable)  *
     * ------------------------------------------------------------------ */
    new k8s.apiextensions.CustomResource(
      "letsencrypt-prod-dns",
      {
        apiVersion: "cert-manager.io/v1",
        kind: "ClusterIssuer",
        metadata: { name: "letsencrypt-prod-dns" },
        spec: {
          acme: {
            email: adminEmail,
            server: "https://acme-v02.api.letsencrypt.org/directory",
            privateKeySecretRef: { name: "letsencrypt-prod-dns" },
            solvers: [
              {
                dns01: {
                  webhook: {
                    groupName: "acme.godaddy.com",
                    solverName: "godaddy",
                    config: {
                      production: true,
                      apiKeySecretRef: {
                        name: godaddyCreds.metadata.name,
                        Key: "token",
                        key: "token"
                      },
                      ttl: 600,
                      propagationTimeout: 600, // seconds
                      pollingInterval: 30, // seconds
                      sequenceInterval: 60 // seconds (optional, safe default)
                    }
                  }
                }
              }
            ]
          }
        }
      },
      { provider, parent: this, dependsOn: webhook }
    );
  }
}
