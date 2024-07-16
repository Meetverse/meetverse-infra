import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export function updater(
  namespace: k8s.core.v1.Namespace,
  k8sProvider: k8s.Provider
) {
  const config = new pulumi.Config();

  // Define the service account
  const serviceAccount = new k8s.core.v1.ServiceAccount(
    "image-checker-sa",
    {
      metadata: { namespace: namespace.metadata.name }
    },
    { provider: k8sProvider }
  );
  const cronString = config.get("cronString") || "*/10 * * * *";
  // Define the role with necessary permissions
  const role = new k8s.rbac.v1.Role(
    "image-update-role",
    {
      metadata: {
        namespace: namespace.metadata.name
      },
      rules: [
        {
          apiGroups: [""],
          resources: ["pods"],
          verbs: ["get", "list", "watch"]
        },
        {
          apiGroups: ["apps"],
          resources: ["deployments"],
          verbs: ["get", "list", "watch", "patch"]
        }
      ]
    },
    { provider: k8sProvider }
  );

  // Bind the role to the service account
  const roleBinding = new k8s.rbac.v1.RoleBinding(
    "image-update-rolebinding",
    {
      metadata: {
        namespace: namespace.metadata.name
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: serviceAccount.metadata.name,
          namespace: namespace.metadata.name
        }
      ],
      roleRef: {
        kind: "Role",
        name: role.metadata.name,
        apiGroup: "rbac.authorization.k8s.io"
      }
    },
    { provider: k8sProvider }
  );

  // Define the CronJob
  const cronJob = new k8s.batch.v1.CronJob(
    "image-update-checker",
    {
      metadata: {
        namespace: namespace.metadata.name
      },
      spec: {
        schedule: cronString, // Adjust the schedule as needed
        jobTemplate: {
          spec: {
            template: {
              metadata: {
                labels: {
                  app: "image-checker-cronjob"
                }
              },
              spec: {
                containers: [
                  {
                    name: "image-checker",
                    image: "lachlanevenson/k8s-kubectl",
                    command: [
                      "/bin/sh",
                      "-c",
                      `
# Check deployments by timur dundar
backendpod=$(kubectl get pods -n meetverse | grep 'meetverse-chart' | grep -v -E '(-fe-|migrate|mongodb)' | awk '{print $1}')
remotebackendsha=$(curl -I -H "Accept: application/vnd.docker.distribution.manifest.v2+json" "https://us-west1-docker.pkg.dev/v2/meetversetest/meetverse/api/manifests/latest" | grep docker-content-digest | cut -d' ' -f2 | tr -d '\r\n')
backendsha=$(kubectl get pod $backendpod -n meetverse -o jsonpath="{.status.containerStatuses[0].imageID}" | cut -d'@' -f2 | tr -d '\r\n')
frontendpod=$(kubectl get pods -n meetverse | grep 'meetverse-chart' | grep -E '(-fe-)' | awk '{print $1}')
remotefrontendsha=$(curl -I -H "Accept: application/vnd.docker.distribution.manifest.v2+json" "https://us-west1-docker.pkg.dev/v2/meetversetest/meetverse/web/manifests/latest" | grep docker-content-digest | cut -d' ' -f2 | tr -d '\r\n')
frontendsha=$(kubectl get pod $frontendpod -n meetverse -o jsonpath="{.status.containerStatuses[0].imageID}" | cut -d'@' -f2 | tr -d '\r\n')
backenddeployment=$(kubectl get deployments -n meetverse | awk '/meetverse-chart-/ {print $1}' | grep -v -E '(-fe$|mongodb$)')
frontenddeployment=$(kubectl get deployments -n meetverse | awk '/meetverse-chart-/ {print $1}' | grep -E '(-fe$)')
if [ "$backendsha" != "$remotebackendsha" ]; then
    echo "Backend SHA is different from remote SHA. Rolling out update..."
    echo "$backendsha\n$remotebackendsha"
    kubectl rollout restart deployment $backenddeployment -n meetverse
else
    echo "Backend SHA matches the remote SHA. No update needed."
fi
if [ "$frontendsha" != "$remotefrontendsha" ]; then
    echo "Frontend SHA is different from remote SHA. Rolling out update..."
    echo "$frontendsha\n$remotefrontendsha"
    kubectl rollout restart deployment $frontenddeployment -n meetverse
else
    echo "Frontend SHA matches the remote SHA. No update needed."
fi
`
                    ]
                  }
                ],
                restartPolicy: "OnFailure",
                serviceAccountName: serviceAccount.metadata.name
              }
            }
          }
        }
      }
    },
    { provider: k8sProvider }
  );
  const networkPolicy = new k8s.networking.v1.NetworkPolicy(
    "allow-cronjob-egress",
    {
      metadata: {
        namespace: namespace.metadata.name,
        name: "allow-cronjob-egress"
      },
      spec: {
        podSelector: {
          matchLabels: {
            app: "image-checker-cronjob"
          }
        },
        policyTypes: ["Egress"],
        egress: [
          {
            to: [
              {
                ipBlock: {
                  cidr: "0.0.0.0/0"
                }
              }
            ],
            ports: [
              {
                protocol: "TCP",
                port: 443
              }
            ]
          }
        ]
      }
    },
    { provider: k8sProvider }
  );
}
