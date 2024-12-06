import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { Repository } from "@pulumi/gcp/artifactregistry";
import { MeetVerseSecret, MeetverseSecrets } from "../secret";
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

export class MeetverseChart extends pulumi.ComponentResource {
  constructor(
    provider: k8s.Provider,
    repository: Repository,
    annotations: Record<string, string>,
    webHostname: string
  ) {
    super("Meetverse:Cluster:Helm:Meetverse", "meetverse-chart");

    const mongoServiceName = "mongodb";
    const qdrantServiceName = "qdrant";

    const appLabels = {
      app: "meetverse"
    };

    const meetversesNs = new k8s.core.v1.Namespace(
      "meetverse-ns",
      {
        metadata: {
          labels: appLabels,
          name: "meetverse"
        }
      },
      { provider: provider }
    );

    const serviceAccount = new gcp.serviceaccount.Account("service-account", {
      accountId: "meetverse-sa",
      displayName: "Service Account for meetverse application"
    });
    const topic = new gcp.pubsub.Topic("meetverse-meeting-topic", {
      name: "meetverse-meeting-topic"
    });
    const subscription = new gcp.pubsub.Subscription(
      "meetverse-meeting-subscription",
      {
        name: "meetverse-meeting-subscription",
        topic: topic.name,
        pushConfig: {
          pushEndpoint: `https://${webHostname}/api/meetingUpdated `
        },
        ackDeadlineSeconds: 30
      }
    );
    updater(meetversesNs, provider);
    meetversesNs.metadata.name.apply(async (namespace) => {
      gcp.organizations.getProject({}).then((project) => {
        config.requireSecret("qdrant-key").apply((qdrantKey) => {
          config.requireSecret("google-client_id").apply((google_client_id) => {
            config.requireSecret("google-secret").apply((google_secret) => {
              config
                .requireSecret("google-client_id")
                .apply((google_client_id) => {
                  config.requireSecret("dbrootpass").apply((dbrootpass) => {
                    config.requireSecret("dbpass").apply((dbpass) => {
                      new gcp.pubsub.TopicIAMMember("topic-iam-binding", {
                        topic: topic.name.apply(
                          (t) => `${project.id}/topics/${t}`
                        ),
                        role: "roles/pubsub.publisher",
                        member: "allAuthenticatedUsers"
                      });
                      // Create the 'Vertex AI User' service account
                      const vertexAiUser = new gcp.serviceaccount.Account(
                        "vertexAiUser",
                        {
                          accountId: "vertex-ai-user",
                          displayName: "Vertex AI User"
                        }
                      );
                      pulumi.log.info(
                        `Meetverse deployment project: ${project.projectId}`
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
                        }
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
                      vertexAiUserKeyJson.apply((keyJson) => {
                        pulumi.log.info(`Vertex AI User Key JSON: ${keyJson}`);
                      });
                      const secretValues: MeetVerseSecret = {
                        GOOGLE_CLIENT_ID: google_client_id,
                        GOOGLE_CLIENT_SECRET: google_secret,
                        QDRANT_API_KEY: qdrantKey,
                        MONGODB_URI: `mongodb://${dbuser}:${dbpass}@${mongoServiceName}.${namespace}.svc.cluster.local/${dbname}`,
                        "mongodb-passwords": dbpass,
                        "mongodb-root-password": dbrootpass,
                        VERTEX_AI_USER_KEY: vertexAiUserKeyJson
                      };
                      const secret = new MeetverseSecrets(
                        namespace,
                        secretValues,
                        provider
                      );
                      secret.secretResource.metadata.name.apply(
                        (secretname) => {
                          let env: Env[] = [
                            {
                              name: "WEB_URI",
                              value: `https://${webHostname}`
                            },

                            {
                              name: "QDRANT_HOST",
                              value: `${qdrantServiceName}.${namespace}.svc.cluster.local`
                            },
                            {
                              name: "QDRANT_PORT",
                              value: "6333"
                            },
                            {
                              name: "QDRANT_HTTPS",
                              value: "false"
                            },
                            {
                              name: "QDRANT_COLLECTION",
                              value: "meetverse"
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
                              value: project.projectId
                            },
                            {
                              name: "MEETING_TOPIC_NAME",
                              value: `${topic.name}`
                            },
                            {
                              name: "MEETING_SUBSCRIPTION_NAME",
                              value: `${subscription.name}`
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
                            "meetverse-chart",
                            {
                              chart: "meetverse",
                              version: "0.3.9",
                              namespace: meetversesNs.metadata.name,
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
                                    cpu: "512m",
                                    memory: "2Gi"
                                  },
                                  limits: {
                                    cpu: "512m",
                                    memory: "2Gi"
                                  }
                                },
                                image: {
                                  pullPolicy: "Always",
                                  tag: "latest"
                                },
                                serviceAccount: {
                                  name: "meetverse-k8s",
                                  annotations: {
                                    "iam.gke.io/gcp-service-account":
                                      serviceAccount.email
                                  }
                                },
                                ingress: {
                                  annotations: annotations,
                                  tls: [
                                    {
                                      secretName: "meetverse-tls",
                                      hosts: [webHostname]
                                    }
                                  ],
                                  hosts: [
                                    {
                                      host: webHostname,
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
                                },
                                qdrant: {
                                  apiKey: qdrantKey,
                                  fullnameOverride: "qdrant"
                                },
                                mongodb: {
                                  resources: {
                                    requests: {
                                      cpu: "500m",
                                      memory: "512Mi"
                                    },
                                    limits: {
                                      cpu: "500m",
                                      memory: "512Mi"
                                    }
                                  },
                                  service: {
                                    nameOverride: mongoServiceName
                                  },
                                  auth: {
                                    usernames: [dbuser],
                                    databases: [dbname],
                                    existingSecret: secretname
                                  }
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
