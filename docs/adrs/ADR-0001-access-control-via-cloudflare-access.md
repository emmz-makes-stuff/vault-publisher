# ADR-0001: Access control by Cloudflare Access, not custom magic-link auth

- **Status**: Accepted
- **Date**: 2026-08-25
- **Deciders**: Product Owner (final call), Architect (recommendation)

## Context

The published site carries client-confidential material — a commissioned software audit, named individuals with assessed capabilities, infrastructure and security weaknesses. The `reader-access` spec states the governing constraint: no unauthenticated request reaches any page *or asset*. The project is only permissible while that holds.

The Product Owner's stated preference in discovery was an emailed magic link, for the reason that the readers' password management practices are unknown. Three readers today, more possible later. The allow-list must live outside the vault repository and be changeable without a commit, with no password store and no user database.

The question is therefore not "which auth flow is nicest" but **how much of the confidentiality guarantee rests on code we wrote.**

## Decision

Put the site behind **Cloudflare Access (Zero Trust)** with the **one-time PIN** login method. The Access policy is `Include → Emails → <the reader addresses>`, edited in the Cloudflare dashboard.

No authentication code is written for this project. There is no session handling, no token signing, no cookie management, no nonce store and no transactional email provider.

## Consequences

**What this buys**

- Access gates the entire hostname at the edge. Pages, images and every other asset are protected by the same policy; there is no path where a static asset is served past the gate.
- The allow-list is a dashboard edit — outside the vault repository, no commit, no republish. Satisfies `reader-access` directly.
- Cloudflare sends the login email **only** if the address is on the policy, while the login page reports "a code has been emailed to you" regardless. The login page therefore does not confirm or deny who the readers are.
- The credential is single-use and expires after 10 minutes; requesting a new one invalidates the previous.
- Free tier covers 50 users. No cost at this scale.
- Eliminates an entire runtime from the system: no Worker script, no KV, no email provider, no secrets beyond the deploy token.

**What this costs**

- **The emailed credential is a six-digit code to paste, not a link to click.** This is a real deviation from the Product Owner's stated preference and was accepted knowingly. The *reason* behind that preference — that readers should not need to manage a password — is satisfied identically. The `reader-access` spec was amended from "single-use link" to "single-use credential delivered by email" so the specification describes what ships.
- Email link-scanning tools can consume the credential before the reader does, showing "This One-Time PIN has already been used". The remedy is requesting a fresh code, and allowlisting `noreply@notify.cloudflare.com` in any mail filtering.
- Binds the project to Cloudflare as the access-control provider.

**Required deployment condition**

Access protects hostnames in a zone the account controls. The `workers.dev` route for the Worker **must be disabled** — it is Cloudflare's domain, cannot carry an Access policy, and would serve the entire confidential site unauthenticated to anyone who found it. See ADR-0003.

## Alternatives considered

**Custom magic link — a Worker calling a transactional email provider.** Rejected. It delivers the click-a-link experience, but places token signing and verification, expiry, single-use nonce storage, cookie flags and scope, asset-path gating, and email deliverability inside code written for this project. Each is a place where a defect is a client-confidentiality breach rather than a bug. The convenience gained is one click, a handful of times a week, for three people.

**A third-party identity provider (Auth0, Clerk, Netlify Identity).** Rejected. Adds a vendor and a configuration surface disproportionate to three readers, without improving on Access's guarantee.

**Shared-password site protection.** Rejected. No per-person allow-list, no revocation of an individual, and it reintroduces exactly the password-handling problem the Product Owner wanted to avoid.

**Unguessable URL only.** Rejected in discovery — the Product Owner stated authentication as a hard requirement, and obscurity gives no revocation and no audit.

## Revisiting

If the code-paste flow proves an obstacle in practice, a magic-link Worker can replace the gate as a later change without touching the content pipeline: the generator, the selection model and the deployment are all independent of how the gate authenticates. That path was left deliberately open.
