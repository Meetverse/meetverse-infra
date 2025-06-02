import { MarzoAICluster } from "./cluster";
import { MarzoAIRepository } from "./registry";
import { MarzoAIDNS } from "./dns";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

const repo = new MarzoAIRepository();

const config = new pulumi.Config();
const domain = config.require("domain");
const app_hostname = config.require("app_hostname");

const webHostname = `${app_hostname}.${domain}`;
const webHostnameWild = `${domain}`;

const cluster = new MarzoAICluster(
  "felipe.cruxen@toptal.com",
  repo.registry,
  webHostname,
  webHostnameWild,
  undefined
);

cluster.nginxRelease.resourceNames.apply((resources) => {
  console.log(resources["Service/v1"]);
  const service = k8s.core.v1.Service.get(
    "nginx",
    pulumi.interpolate`${resources["Service/v1"][0]}`,
    { provider: cluster.clusterProvider }
  );

  // Export the external IP address of the Service if it is of type LoadBalancer
  const serviceExternalIP = service.status.apply((status) => {
    const ingress = status.loadBalancer?.ingress?.[0];
    if (ingress && ingress.ip) {
      return ingress.ip;
    }
    return "IP not available yet";
  });
  serviceExternalIP.apply((ip) => {
    pulumi.log.info(`Marzo.AI deployment IP: ${ip}`);

    new MarzoAIDNS(ip, webHostname);
  });
});
