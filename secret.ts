import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export type MeetVerseSecret = {
    OPENAI_API_KEY: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    GMAIL_REFRESH_TOKEN: string
    GMAIL_CLIENT_ID: string
    GMAIL_CLIENT_SECRET: string
    QDRANT_API_KEY: string
    DD_API_KEY: string
    MONGODB_URI: string
    "mongodb-passwords": string
    "mongodb-root-password": string
}

export class MeetverseSecrets extends pulumi.ComponentResource {
    secretResource: k8s.core.v1.Secret
    constructor(namespace: string, secretValues: MeetVerseSecret) {
        super("Meetverse:Secrets", "meetverse-secrets");

        this.secretResource = new k8s.core.v1.Secret("meetverse-secret", {
            metadata: {
                name: "meetverse",
                namespace: namespace
            },
            // `data` field must contain base64-encoded strings.
            // Use the `pulumi.secret` method to encrypt the secret before storing it in state.
            stringData: secretValues
        });



    }
}
