import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export class MeetVerseDNS extends pulumi.ComponentResource {
  public gateway: gcp.dns.RecordSet | undefined;
  public web: gcp.dns.RecordSet | undefined;
  constructor(gw_ip: string, webHostname: string) {
    super("Meetverse:DNS", "meetverse-dns");
    const config = new pulumi.Config();
    const zoneId = config.get("dns_zone");
    if (!zoneId) {
      return;
    }
    const dnsZone = gcp.dns.getManagedZone({ name: zoneId });
    const zoneName = dnsZone.then((envDnsZone) => envDnsZone.name);

    this.gateway = new gcp.dns.RecordSet("gateway", {
      name: dnsZone.then((zone) => `meetverse.gateway.${zone.dnsName}`),
      type: "A",
      managedZone: zoneName,
      rrdatas: [gw_ip]
    });

    this.web = new gcp.dns.RecordSet("web", {
      name: `${webHostname}.`,
      type: "CNAME",
      managedZone: zoneName,
      rrdatas: [this.gateway.name]
    });
  }
}
