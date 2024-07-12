import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as certmanager from "@pulumi/kubernetes-cert-manager";

export class CertManagerChart extends pulumi.ComponentResource {
    constructor(provider: k8s.Provider, adminEmail: string) {
        super("Meetverse:Cluster:Helm:CertManager", "cert-manager-chart");
        const nsName = "default";

        const manager = new certmanager.CertManager("cert-manager", {
            installCRDs: true,
            podDnsConfig: {
                nameservers: ["8.8.8.8"]
            },
            podDnsPolicy: "None",
            helmOptions: {
                namespace: nsName,
            },
        }, {provider: provider});

        new k8s.apiextensions.CustomResource("<clusterIssuerName>", {
            apiVersion: "cert-manager.io/v1",
            kind: "ClusterIssuer",
            metadata: {
                name: "letsencrypt-prod-http",
            },
            spec: {
                acme: {
                    server: "https://acme-v02.api.letsencrypt.org/directory",
                    email: adminEmail,
                    privateKeySecretRef: {
                        // Kubernetes Secret to store the automatically created private key for the Issuer
                        name: "letsencrypt-prod-http",
                    },
                    solvers: [{
                        // Configuration for the HTTP01 challenge provider
                        http01: {
                            ingress: {
                                class: "nginx",
                            },
                        },
                    }],
                },
            },
        }, { provider: provider, dependsOn: manager }); // Assuming we have a Kubernetes provider configured as 'k8sProvider'
    }
}
