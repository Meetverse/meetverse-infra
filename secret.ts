import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export type MeetVerseSecret = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  QDRANT_API_KEY: string;
  MONGODB_URI: string;
  "mongodb-passwords": string;
  "mongodb-root-password": string;
  VERTEX_AI_USER_KEY: pulumi.Output<string>;
};

export class MeetverseSecrets extends pulumi.ComponentResource {
  secretResource: k8s.core.v1.Secret;
  constructor(
    namespace: string,
    secretValues: MeetVerseSecret,
    k8sProvider?: pulumi.ProviderResource
  ) {
    super("Meetverse:Secrets", "meetverse-secrets");

    this.secretResource = new k8s.core.v1.Secret(
      "meetverse-secret",
      {
        metadata: {
          name: "meetverse",
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
