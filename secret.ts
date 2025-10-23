import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export type MarzoAISecret = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MONGODB_URI: string;
  "mongodb-passwords": string;
  "mongodb-root-password": string;
  VERTEX_AI_USER_KEY: pulumi.Output<string>;
};

export class MarzoAISecrets extends pulumi.ComponentResource {
  secretResource: k8s.core.v1.Secret;
  constructor(
    namespace: string,
    secretValues: MarzoAISecret,
    k8sProvider?: pulumi.ProviderResource
  ) {
    super("MarzoAI:Secrets", "marzoai-secrets");

    this.secretResource = new k8s.core.v1.Secret(
      "marzoai-secret",
      {
        metadata: {
          name: "marzoai",
          namespace: namespace
        },
        // `data` field must contain base64-encoded strings.
        // Use the `pulumi.secret` method to encrypt the secret before storing it in state.
        stringData: secretValues
      },
      { provider: k8sProvider }
    );
  }
}
