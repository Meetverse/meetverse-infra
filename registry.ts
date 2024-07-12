import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

export class MeetverseRepository extends pulumi.ComponentResource {
    registry: gcp.artifactregistry.Repository

    constructor() {
        super("Meetverse:Registry:Meetverse", "meetverse-registry");

        this.registry = new gcp.artifactregistry.Repository("meetverse", {
            repositoryId: "meetverse",
            format: "DOCKER"
        });
    }
}
