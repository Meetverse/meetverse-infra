import {MeetVerseCluster} from "./cluster";
import {MeetverseRepository} from "./registry";
import {MeetVerseDNS} from "./dns";
import * as k8s from '@pulumi/kubernetes'
import * as pulumi from "@pulumi/pulumi";

const repo = new MeetverseRepository();

const config = new pulumi.Config();
const domain = config.require('domain');
const app_hostname = config.require('app_hostname');

const webHostname = `${app_hostname}.${domain}`;

const cluster = new MeetVerseCluster('felipe.cruxen@toptal.com', repo.registry, webHostname, undefined)

cluster.nginxRelease.resourceNames.apply(resources => {
    console.log(resources['Service/v1']);
    const service = k8s.core.v1.Service.get("nginx", pulumi.interpolate`${resources['Service/v1'][0]}`);

    // Export the external IP address of the Service if it is of type LoadBalancer
    const serviceExternalIP = service.status.apply(status => {
        const ingress = status.loadBalancer?.ingress?.[0];
        if (ingress && ingress.ip) {
            return ingress.ip;
        }
        return "IP not available yet";
    });
    serviceExternalIP.apply(ip => {
        new MeetVerseDNS(ip, webHostname)
    })
})





