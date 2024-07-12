# infrastructure

# Pulumi Project

This project uses Pulumi to manage infrastructure as code, with local state and secrets management. The project is written in Node.js.

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

- [Node.js](https://nodejs.org/) (version 14 or later)
- [Pulumi](https://www.pulumi.com/) (version 3.0 or later)
- [Yarn](https://yarnpkg.com/) (Node.js package manager)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Meetverse/infrastructure
cd infrastructure
```

### 2. Install Dependencies
```bash
yarn install
```

### 3. Authenticate with GCP
When developing locally, we recommend that you install the Google Cloud SDK and then authorize access with a user account. Next, Pulumi requires default application credentials to interact with your Google Cloud resources, so run auth application-default login command to obtain those credentials:
```bash
gcloud auth application-default login
```

To configure Pulumi to interact with your Google Cloud project, set it with the pulumi config command using the project’s ID:
```bash
pulumi config set gcp:project your-gcp-project-id
```

You may also set your Google Cloud Project via environment variable (listed in order of precedence):
```bash
GOOGLE_PROJECT
GOOGLE_CLOUD_PROJECT
GCLOUD_PROJECT
CLOUDSDK_CORE_PROJECT
export GOOGLE_PROJECT=your-gcp-project-id
```

### 4. Configure Pulumi
Pulumi uses a Pulumi.yaml file to configure the project. Ensure this file exists in the project root with the following content:

```yaml
name: <project-name>
runtime: nodejs
```

### 5. Set Up Local State and Secrets
Pulumi allows you to store state and secrets locally. The same state can be saved anywhere, like a cloud storage, or even the pulumi cloud service. [The stack can be easily imported
or exported.](https://www.pulumi.com/docs/cli/commands/pulumi_stack_export/)

The passphrase for this current deployment is set in [Google's Secret Manager](https://console.cloud.google.com/security/secret-manager/secret/pulumi/versions?project=meetversetest)

```bash
export PULUMI_CONFIG_PASSPHRASE=<your-secure-passphrase>
```

### 6. Configure Pulumi Stack

Set config values:

```bash
pulumi config set gcp:project <some-project-name>
pulumi config set <config-key> <config-value>
```

Set secrets:

```bash
pulumi config set --secret infrastructure:dbpass <secret-value> 
pulumi config set --secret <secret-key> <secret-value>
```

### 7. Deploy Your Infrastructure

To preview the changes:

```bash
pulumi preview --diff
```

To deploy the changes:

```bash
pulumi up
```

### 8. Destroy Your Infrastructure
If you need to tear down your infrastructure, you can do so with:

```bash
pulumi destroy
```

### 9. Destroy Your Infrastructure
If you need to refresh (resync) the current state with deployed infra:
```bash
pulumi refresh
```

## Project Structure
The project structure looks like this:
```
.
├── .pulumi
├── helm
├── tpl
├── Pulumi.yaml
├── Pulumi.main.yaml
├── index.ts
├── package.json
├── node_modules/
├── dns.ts
├── registry.ts
├── secret.ts
├── cluster.ts
├── tsconfig.json
└── README.md
```

Pulumi.yaml: The main Pulumi project configuration file.

Pulumi.main.yaml: The stack-specific configuration file for the main stack.

index.ts: The main entry point for the Pulumi program.

package.json: The NPM configuration file.

node_modules/: The directory where NPM modules are installed.

.pulumi/: The directory where Pulumi state files are stored.

README.md: This file.

