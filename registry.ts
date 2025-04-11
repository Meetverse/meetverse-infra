import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

export class MarzoAIRepository extends pulumi.ComponentResource {
  registry: gcp.artifactregistry.Repository;

  constructor() {
    super("MarzoAI:Registry:MarzoAI", "marzoai-registry");

    this.registry = new gcp.artifactregistry.Repository("marzoai", {
      repositoryId: "marzoai",
      format: "DOCKER"
    });
  }
}
