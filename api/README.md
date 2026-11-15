# API

Pre-release. Everything a program can call on a shippin.tech server, grouped by where it comes from.
`GET /api` on a running server lists what is live; `resources/product/api.json` is the same list
with the proof for each area.

## Compatible: the interfaces other software already speaks

These keep the standard or upstream shape so existing clients, mail apps and tools work unchanged.
They are the reason a person can move to or from this server without leaving their devices behind.
Each row names the check that tried it, run against the local stack:
`py -3.11 deploy/local/verify_compat.py` (15 checks, passing on 2026-11-15).

| Surface | Where served | Spec or standard | Tried by |
| --- | --- | --- | --- |
| Management API: sign-in, discovery, account, schema, delivery/tracing/metrics tokens and live streams | `/api/auth`, `/api/discover`, `/api/account`, `/api/schema`, `/api/token`, `/api/live` | [`compat/v1/openapi.yml`](compat/v1/openapi.yml) | `ui/e2e-live/` (sign-in, tracing, dashboard) |
| JMAP session and discovery; mail, calendars, contacts, files, and the registry (all configuration) | `/jmap/session`, `/jmap`, `/.well-known/jmap` | RFC 8620, 8621 and the JMAP calendar, contact and file drafts | `verify_compat.py` (discovery, session with and without credentials); `verify.py` (mail) |
| WebDAV, CalDAV, CardDAV | `/dav/{pal,cal,card,file}`, `/.well-known/caldav`, `/.well-known/carddav` | RFC 4918, 4791, 6352 | `verify_compat.py` (well-known redirects, PROPFIND 207). No calendar or contact round trip through a DAV client yet |
| IMAP over TLS | 993 | RFC 9051 | `verify_compat.py`, `verify.py` |
| POP3 over TLS | 995 | RFC 1939 | `verify_compat.py` (login, STAT) |
| SMTP: inbound, and submission over implicit TLS | 25, 465 | RFC 5321, 6409 | `verify_compat.py`, `verify.py` |
| ManageSieve | 4190 | RFC 5804 | `verify_compat.py` (greeting only; no script upload) |
| OAuth 2.0 and OpenID Connect metadata | `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration` | RFC 8414, OpenID Connect Discovery | `verify_compat.py`; sign-in in `ui/e2e-live/` |
| Mail client setup | `/mail/config-v1.1.xml`, `/autodiscover/*` | Mozilla autoconfig, Microsoft Autodiscover | `verify_compat.py` |
| Health | `/healthz/live`, `/healthz/ready` | | `verify_compat.py` |

**TLS only by default.** The server listens on 25, 465, 993, 995, 4190, 443 and 8080. It has no
587 (STARTTLS submission), 143 (IMAP) or 110 (POP3) listener, and the client setup documents
advertise 993, 995 and 465 only. A client that can only use 587 or 143 cannot connect until a
listener is added. This is by design today; whether to add those ports is an owner decision.

## Ours: added by shippin.tech

| Surface | Where served | Spec |
| --- | --- | --- |
| Free plan, panel, organisations, SSO, SCIM, recovery, alerts, masked addresses, keys, AI settings, the assistant, lessons, Google link, MCP, stats and traces | `/api/*` | [`shippin/v1/openapi.yml`](shippin/v1/openapi.yml) |
| Agent tools (MCP) | `/api/mcp` | `resources/product/actions.json` |

`platform/api/openapi/` is a different API: the Go control plane that places and updates mail
hosts. It is not served by the mail server.

## Rules

1. A route is added to the server only together with its entry in a spec.
2. Compatible surfaces change only to follow their standard. Our additions never take over a
   compatible path.
3. `node scripts/check-api-coverage.mjs` fails when the `/api` dispatcher serves a route no spec
   documents. It runs in the Check workflow.
4. What a route does is proven by a test named in the spec (`x-proof`) or in `api.json`.
   An entry without proof says so (`x-unverified`).
