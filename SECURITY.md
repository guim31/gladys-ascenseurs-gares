# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **No secret**: the SNCF and City of Paris open data portals need no account
  and no key.
- **Nothing stored in `/data`**: the station names live in the Gladys
  configuration, the station list and the last states in memory only.
- **Network**: outgoing HTTPS requests only, to `ressources.data.sncf.com` and
  `opendata.paris.fr`, with a timeout and a size cap on every answer. The station ids put in the
  query are checked (UUIDs only); the Paris request is a fixed URL. No port is opened.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the SNCF and City of Paris open data portals.
