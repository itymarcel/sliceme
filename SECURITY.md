# Security policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose user files, credentials, deployment secrets, printer access, or remote-code execution.

Send a private report through GitHub's **Report a vulnerability** interface on the repository Security tab. Include:

- the affected commit/deployment;
- impact and realistic attack path;
- minimal reproduction steps;
- relevant request/response details with secrets removed;
- any suggested mitigation.

If private vulnerability reporting is unavailable, open a public issue containing only a request for a private contact channel—do not include exploit details.

## Scope

Security-sensitive areas include untrusted STL/STEP/3MF parsing, archive/XML limits, slicer subprocess execution, temporary-file handling, AI-provider requests, browser persistence, direct printer delivery, admin telemetry access, and deployment configuration.

## Support policy

Security fixes target the latest `master` deployment. This early-beta project does not currently maintain parallel supported release branches or guarantee a response SLA. Reports will be acknowledged and triaged as maintainer availability permits.

Never include private models, API keys, printer credentials, access tokens, or personal information in a report.
