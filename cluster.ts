import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as gcp from "@pulumi/gcp";
import { NginxChart } from "./helm/nginx";
import * as fs from "fs";
import { templateSettings, template } from "lodash";
import { CertManagerChart } from "./helm/cert-manager";
import { Repository } from "@pulumi/gcp/artifactregistry";
import { MarzoAIChart } from "./helm/marzoai";
import { CertDaddyManagerChart } from "./helm/cert-manager-godaddy";

templateSettings.interpolate = /\${([\s\S]+?)}/g;

export class MarzoAICluster extends pulumi.ComponentResource {
  public nginxRelease: k8s.helm.v3.Release;
  public clusterProvider: k8s.Provider;

  constructor(
    adminEmail: string,
    repository: Repository,
    webHostname: string,
    webHostnameWild: string,
    diskSize: number | undefined
  ) {
    super("MarzoAI:Cluster", "cluster");
    const config = new pulumi.Config();
    const name = "marzoai-cluster";
    diskSize = diskSize || 100;

    const serviceAccountEmail = config.get("serviceAccountEmail");

    let serviceAccountAddition = {};
    if (
      !!serviceAccountEmail &&
      serviceAccountEmail !== "" &&
      serviceAccountEmail !== "default"
    ) {
      serviceAccountAddition = {
        serviceAccount: serviceAccountEmail
      };
    }
    // Create a GKE cluster
    const engineVersion = gcp.container
      .getEngineVersions()
      .then((v) => v.latestMasterVersion);
    const addition = {};
    const network = config.get("network");
    const subnetwork = config.get("subnetwork");
    if (network && network !== "default") {
      addition["network"] = network;
      if (subnetwork && subnetwork !== "default") {
        addition["subnetwork"] = subnetwork;
      }
    }
    const cluster = new gcp.container.Cluster(name, {
      initialNodeCount: 1,
      removeDefaultNodePool: true,
      minMasterVersion: engineVersion,
      ...addition,
      nodeConfig: {
        machineType: "n1-standard-2",
        diskSizeGb: 50,
        ...serviceAccountAddition
      }
    });

    new gcp.container.NodePool("marzoai-node-pool", {
      cluster: cluster.name,
      initialNodeCount: 1,
      autoscaling: {
        minNodeCount: 0,
        maxNodeCount: 1
      },
      nodeConfig: {
        machineType: "n1-standard-2",
        diskSizeGb: 50,
        oauthScopes: [
          "https://www.googleapis.com/auth/compute",
          "https://www.googleapis.com/auth/devstorage.read_only",
          "https://www.googleapis.com/auth/logging.write",
          "https://www.googleapis.com/auth/monitoring"
        ],
        ...serviceAccountAddition
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

    const clusterProvider = new k8s.Provider(
      name,
      {
        kubeconfig: kubeconfig
      },
      { dependsOn: cluster }
    );
    this.clusterProvider = clusterProvider;
    const nginx = new NginxChart(clusterProvider);
    this.nginxRelease = nginx.release;

    const cfg = new pulumi.Config();
    const apiKey = cfg.get("gdapiKey");
    if (apiKey && apiKey !== "") {
      new CertDaddyManagerChart(clusterProvider, adminEmail);
    } else {
      new CertManagerChart(clusterProvider, adminEmail);
    }
    new MarzoAIChart(
      clusterProvider,
      repository,
      nginx.annotations,
      webHostname,
      webHostnameWild
    );
  }
}
