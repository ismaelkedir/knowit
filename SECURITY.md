# Security Policy

## Supported Releases

Security fixes are applied to the latest published release.

## Reporting a Vulnerability

Do not open a public GitHub issue for suspected vulnerabilities.

Instead, report them privately to the project maintainer using the security contact listed on the project homepage or repository profile. Include:

- a description of the issue
- impact assessment
- reproduction steps or proof of concept
- any suggested remediation

You should receive an acknowledgement after the report is reviewed.

## Credential Storage

`knowit cloud login` stores cloud credentials at `~/.knowit/credentials.json`.

- The file is written with `0o600` permissions so only the current user can read and write it on correctly configured systems.
- The credentials are stored as plain JSON, not in the OS keychain.
- On shared machines or systems with weak home-directory isolation, treat this as sensitive local secret material and prefer short-lived accounts or explicit logout when appropriate.

An optional OS keychain-backed storage mode is a reasonable future enhancement, but it is not implemented today.
