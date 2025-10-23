import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { Repository } from "@pulumi/gcp/artifactregistry";
import { MarzoAISecret, MarzoAISecrets } from "../secret";
import { updater } from "../updater";

type SecretValue = {
  name: string;
  key: string;
};

type ValueFrom = {
  secretKeyRef: SecretValue;
};

type Env = {
  name: string;
  value?: string;
  valueFrom?: ValueFrom;
};

const config = new pulumi.Config();
const dbuser = config.require("dbuser");
const dbname = config.require("dbname");
const projectId = config.get("externalProjectId");
const externalVertexKey = config.get("externalVertexKey");
const extraJson = config.get("extraJson");
export class MarzoAIChart extends pulumi.ComponentResource {
  constructor(
    provider: k8s.Provider,
    repository: Repository,
    annotations: Record<string, string>,
    webHostname: string,
    webHostnameWild: string
  ) {
    super("MarzoAI:Cluster:Helm:MarzoAI", "marzoai-chart");

    var isExternalProject = projectId !== undefined;

    const appLabels = {
      app: "marzo.ai"
    };

    const marzoaisNs = new k8s.core.v1.Namespace(
      "marzoai-ns",
      {
        metadata: {
          labels: appLabels,
          name: "marzoai"
        }
      },
      { provider: provider }
    );
    const serviceAccount = new gcp.serviceaccount.Account(
      "service-account",
      {
        accountId: "marzoai-sa",
        displayName: "Service Account for marzoai application"
      },
      { deleteBeforeReplace: true }
    );
    let topic: any = undefined;
    if (!isExternalProject) {
      topic = new gcp.pubsub.Topic("meetverse-meeting-topic", {
        name: "meetverse-meeting-topic"
      });
      new gcp.pubsub.Subscription("meetverse-meeting-subscription", {
        name: "meetverse-meeting-subscription",
        topic: topic.name,
        pushConfig: {
          pushEndpoint: `https://${webHostname}/api/meetingUpdated `
        },
        ackDeadlineSeconds: 30
      });
    }
    updater(marzoaisNs, provider);
    marzoaisNs.metadata.name.apply(async (namespace) => {
      gcp.organizations.getProject({}).then((project) => {
        config.requireSecret("google-client_id").apply((google_client_id) => {
          config.requireSecret("google-secret").apply((google_secret) => {
            config
              .requireSecret("google-client_id")
              .apply((google_client_id) => {
                config.requireSecret("dbrootpass").apply((dbrootpass) => {
                  config.requireSecret("dbpass").apply((dbpass) => {
                    var projectIdToUse: any = isExternalProject
                      ? projectId
                      : project.projectId;
                    var setExternalProject = isExternalProject
                      ? "true"
                      : "false";
                    var topicName = isExternalProject
                      ? project.projectId
                      : "meetverse-meeting-topic";
                    var vertexAiKeyToUse: any = undefined;
                    if (externalVertexKey !== undefined) {
                      try {
                        var json = JSON.parse(externalVertexKey);
                        vertexAiKeyToUse = JSON.stringify(json);
                      } catch (error) {}
                    }
                    let extra = {};
                    if (extraJson !== undefined) {
                      try {
                        var json = JSON.parse(extraJson);

                        extra = json;
                      } catch (error) {}
                    }

                    if (!isExternalProject) {
                      new gcp.pubsub.TopicIAMMember("topic-iam-binding", {
                        topic: topic.name.apply(
                          (t) => `${project.id}/topics/${t}`
                        ),
                        role: "roles/pubsub.publisher",
                        member: "allAuthenticatedUsers"
                      });
                    }
                    if (vertexAiKeyToUse === undefined) {
                      // Create the 'Vertex AI User' service account
                      const vertexAiUser = new gcp.serviceaccount.Account(
                        "vertexAiUser",
                        {
                          accountId: "vertex-ai-user",
                          displayName: "Vertex AI User"
                        }
                      );
                      pulumi.log.info(
                        `MarzoAI deployment project: ${project.projectId}`
                      );

                      // Assign necessary roles to the service account
                      const vertexAiUserRoleBinding =
                        new gcp.projects.IAMMember("vertexAiUserRoleBinding", {
                          project: pulumi.interpolate`${project.projectId}`,
                          role: "roles/aiplatform.user",
                          member: pulumi.interpolate`serviceAccount:${vertexAiUser.email}`
                        });
                      const vertexAiUserKey = new gcp.serviceaccount.Key(
                        "vertexAiUserKey",
                        {
                          serviceAccountId: vertexAiUser.name
                        },
                        { dependsOn: [vertexAiUser] }
                      );

                      const vertexAiUserKeyJson =
                        vertexAiUserKey.privateKey.apply((privateKey) => {
                          const json = Buffer.from(
                            privateKey,
                            "base64"
                          ).toString("utf-8");
                          const mobj = JSON.parse(json);
                          return JSON.stringify(mobj);
                        });

                      vertexAiKeyToUse = vertexAiUserKeyJson;
                    }
                    let url = webHostname;

                    const cfg = new pulumi.Config();
                    const apiKey = cfg.get("gdapiKey");
                    if (apiKey && apiKey !== "") {
                      url = `*.${webHostnameWild}`;
                    }
                    const secretValues: MarzoAISecret = {
                      GOOGLE_CLIENT_ID: google_client_id,
                      GOOGLE_CLIENT_SECRET: google_secret,
                      MONGODB_URI: `${dbuser}`,
                      "mongodb-passwords": dbpass,
                      "mongodb-root-password": dbrootpass,
                      VERTEX_AI_USER_KEY: vertexAiKeyToUse,
                      ...extra
                    };
                    const secret = new MarzoAISecrets(
                      namespace,
                      secretValues,
                      provider
                    );
                    secret.secretResource.metadata.name.apply((secretname) => {
                      let env: Env[] = [
                        {
                          name: "WEB_URI",
                          value: `https://${webHostname}`
                        },
                        {
                          name: "GOOGLE_REDIRECT_URIS",
                          value: `["http://localhost:8000/api/oauth2callback","https://${webHostname}/oauth2callback"]`
                        },
                        {
                          name: "RUN_MODE",
                          value: "cloud"
                        },
                        {
                          name: "DB_NAME",
                          value: dbname
                        },
                        {
                          name: "PERSISTENT_SESSION",
                          value: "true"
                        },
                        {
                          name: "DD_LOGS_INJECTION",
                          value: "false"
                        },
                        {
                          name: "DD_SITE",
                          value: "us5.datadoghq.com"
                        },
                        {
                          name: "DD_TRACE_ENABLED",
                          value: "true"
                        },
                        {
                          name: "DD_TRACE_PROPAGATION_STYLE",
                          value: "datadog"
                        },
                        {
                          name: "GOOGLE_PROJECT_ID",
                          value: projectIdToUse
                        },
                        {
                          name: "EXTERNAL_PROJECT",
                          value: setExternalProject
                        },
                        {
                          name: "NO_GOOGLE_DRIVE",
                          value: setExternalProject
                        },
                        {
                          name: "MEETING_TOPIC_NAME",
                          value: topicName
                        }
                      ];
                      Object.keys(secretValues).map((key) => {
                        env.push({
                          name: key,
                          valueFrom: {
                            secretKeyRef: {
                              name: secretname,
                              key: key
                            }
                          }
                        });
                      });
                      new k8s.helm.v3.Release(
                        "marzoai-chart",
                        {
                          name: "marzoai-chart",
                          chart: "meetverse",
                          version: "0.4.23",
                          namespace: marzoaisNs.metadata.name,
                          repositoryOpts: {
                            repo: "https://meetverse.github.io/meetverse-chart"
                          },
                          skipCrds: false,
                          values: {
                            replicaCount: 1,
                            env: env,
                            frontend: {
                              image: {
                                tag: "latest"
                              },
                              service: {
                                port: 8080
                              }
                            },
                            livenessProbe: {
                              httpGet: {
                                path: "/health",
                                port: "http"
                              }
                            },
                            readinessProbe: {
                              httpGet: {
                                path: "/health",
                                port: "http"
                              }
                            },
                            resources: {
                              requests: {
                                cpu: "1000m",
                                memory: "2Gi"
                              },
                              limits: {
                                cpu: "2000m",
                                memory: "4Gi"
                              }
                            },
                            image: {
                              pullPolicy: "Always",
                              tag: "latest"
                            },
                            serviceAccount: {
                              name: "marzoai-k8s",
                              annotations: {
                                "iam.gke.io/gcp-service-account":
                                  serviceAccount.email
                              }
                            },
                            ingress: {
                              annotations: annotations,
                              tls: [
                                {
                                  secretName: "marzoai-tls",
                                  hosts: [url]
                                }
                              ],
                              hosts: [
                                {
                                  host: url,
                                  paths: [
                                    {
                                      path: "/",
                                      pathType: "ImplementationSpecific"
                                    },
                                    {
                                      path: "/api",
                                      pathType: "ImplementationSpecific"
                                    },
                                    {
                                      path: "/ws",
                                      pathType: "ImplementationSpecific"
                                    }
                                  ]
                                }
                              ]
                            }
                          }
                        },
                        { provider: provider }
                      );

                      new gcp.artifactregistry.RepositoryIamMember(
                        "iam-member",
                        {
                          location: repository.location,
                          repository: repository.name,
                          role: "roles/artifactregistry.reader",
                          member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`
                        }
                      );
                    });
                  });
                });
              });
          });
        });
      });
    });
  }
}
