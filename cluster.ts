import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as gcp from "@pulumi/gcp";
import { NginxChart } from "./helm/nginx";
import * as fs from "fs";
import { templateSettings, template } from "lodash";
import { CertManagerChart } from "./helm/cert-manager";
import { Repository } from "@pulumi/gcp/artifactregistry";
import { MeetverseChart } from "./helm/meetverse";

templateSettings.interpolate = /\${([\s\S]+?)}/g;

export class MeetVerseCluster extends pulumi.ComponentResource {
  public nginxRelease: k8s.helm.v3.Release;
  public clusterProvider: k8s.Provider;
  constructor(
    adminEmail: string,
    repository: Repository,
    webHostname: string,
    diskSize: number | undefined
  ) {
    super("Meetverse:Cluster", "cluster");
    const name = "meetverse-cluster";
    diskSize = diskSize || 100;
    // Create a GKE cluster
    const engineVersion = gcp.container
      .getEngineVersions()
      .then((v) => v.latestMasterVersion);
    const cluster = new gcp.container.Cluster(name, {
      initialNodeCount: 1,
      removeDefaultNodePool: true,
      minMasterVersion: engineVersion,
      nodeConfig: {
        machineType: "n1-standard-1",
        diskSizeGb: 50
      }
    });

    new gcp.container.NodePool("meetverse-node-pool", {
      cluster: cluster.name,
      initialNodeCount: 1,
      autoscaling: {
        minNodeCount: 0,
        maxNodeCount: 1
      },
      nodeConfig: {
        machineType: "n1-standard-2",
        diskSizeGb: diskSize,
        oauthScopes: [
          "https://www.googleapis.com/auth/compute",
          "https://www.googleapis.com/auth/devstorage.read_only",
          "https://www.googleapis.com/auth/logging.write",
          "https://www.googleapis.com/auth/monitoring"
        ]
      }
    });

    const kubeconfig = pulumi
      .all([cluster.name, cluster.endpoint, cluster.masterAuth])
      .apply(([name, endpoint, masterAuth]) => {
        const context = `${gcp.config.project}_${gcp.config.zone}_${name}`;
        const data = fs.readFileSync("./tpl/kubeconfig", "utf8");
        let compiled = template(data);
        return compiled({
          certificate: masterAuth.clusterCaCertificate,
          endpoint: endpoint,
          context: context
        });
      });

    const clusterProvider = new k8s.Provider(name, {
      kubeconfig: kubeconfig
    });
    this.clusterProvider = clusterProvider;
    const nginx = new NginxChart(clusterProvider);
    this.nginxRelease = nginx.release;

    new CertManagerChart(clusterProvider, adminEmail);

    new MeetverseChart(
      clusterProvider,
      repository,
      nginx.annotations,
      webHostname
    );
  }
}
