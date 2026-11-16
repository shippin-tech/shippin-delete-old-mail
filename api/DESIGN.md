# API design for alpha 0.5

Status: proposal, written 2026-11-15. Nothing here is built yet except where it says **exists**.

shippin.tech is alpha 0.5. There are no production installs, so there is no legacy and no
compatibility promise for anything we run ourselves: the management API, the old web UI bundle
and the paths the Svelte UI calls today can all change in one step, without redirects.
What stays fixed is the standards that other software speaks (SMTP, IMAP, POP3, JMAP, CalDAV,
CardDAV, ManageSieve, OAuth, autoconfig). Those are not legacy; they are the product.

## The one idea

**Rust owns every rule. Svelte only draws what Rust describes and sends what a person did.**

Rust already has the part that makes this possible: the registry. `resources/schema/schema.json.gz`
describes 150 objects, 382 schemas, 317 fields, 360 forms, 72 lists and 154 enums, and the server
validates every write against it. A screen is a form the schema already names, so a new setting
needs no new UI code. The Svelte admin already renders from this schema (`ui/src/lib/admin/`).
The plan is to make that the only way configuration is read or written, for people, for the chat
and for tools.

## What Stalwart taught us (an assessment from the code in this tree, not from upstream docs)

| Observed here | Cost | What we do instead |
| --- | --- | --- |
| Two licences in one tree: 120 `cfg(feature = "enterprise")` sites in 47 files, on by default | Cannot withhold or even list the paid code; the licence cannot be stated honestly | One licence for the server. Paid or withheld code lives in its own crate behind a trait, never in `cfg` inside shared files (B5.7) |
| `/api` is one 475-line function matching strings; auth is checked inside each arm | A route can be added with no auth, no spec, no test; we needed a script to find the gaps | A route table: each row names path, method, permission, request type, response type, proof. The dispatcher, the OpenAPI file and the MCP tool list are all generated from it |
| Management API, JMAP registry calls and a compiled WASM UI bundle (`assets/webui`) are three ways to the same setting | The UI is unreviewable in git; a setting can behave differently by path | One path to configuration (the registry facade below). No compiled bundles in git |
| A second, upstream-shaped management API kept for compatibility (`api/compat`) | Two vocabularies and two error shapes in the same server | Removed in alpha. Our own API only |
| Errors differ per route (text bodies, ad hoc JSON) | Every client writes its own error handling; the chat cannot explain a failure | One error shape everywhere (RFC 9457 problem details plus a `fields` map for form errors) |
| Live data needs a token minted by one route and spent on another (`/api/v1/token/*`, `/api/v1/live/*`) | Extra round trips, short-lived tokens in URLs | One event stream per signed-in session (`GET /api/v1/events`, SSE) |
| Permission names are enum values spread over the code | The UI and chat cannot ask "may I?" before showing a button | The route table carries the permission; `GET /api/v1/me` returns what the caller may do, and the UI hides what it may not use |
| Large settings pages are written by hand per screen | Each upstream change breaks a screen | Screens come from the schema; hand-written screens only for flows (setup, mail, calendar) |

## Shape of API v1

Single prefix `/api/v1`. Anything outside it is either a standard (`/jmap`, `/dav`, `/.well-known`)
or a page.

| Area | Paths | Notes |
| --- | --- | --- |
| Session | `POST /auth/login`, `POST /auth/logout`, `GET /me` | `me` returns identity, role (admin, org admin, user), permission list, brand and feature flags |
| Registry | `GET /registry/schema`, `GET/POST /registry/{object}`, `GET/PATCH/DELETE /registry/{object}/{id}` | A thin REST facade over native JMAP registry methods, for every configuration object. List filters, paging and validation come from the schema. Singletons use the id `singleton` |
| Actions | `GET /actions`, `POST /actions/{name}` | The declared actions (`resources/product/actions.json`). The chat and MCP use these, never raw paths. A write needs the person's approval |
| Events | `GET /events` | Server-sent events: delivery tests, traces, metrics, progress of long jobs |
| Product | `/panel`, `/orgs`, `/sso`, `/scim`, `/masked`, `/keys`, ... | Our features, moved under the prefix unchanged in meaning |
| Chat | `/assistant`, `/ai` | Same prefix; the assistant acts only through Actions |

Rules for every route:

1. It is a row in the route table and cannot exist otherwise.
2. It declares one permission. No route checks permissions by hand.
3. Request and response are typed; the OpenAPI file is generated and checked in CI against the table.
4. Writes are idempotent where possible (`PUT` with a client id) and return the new state.
5. Errors use the one shape. Secrets never appear in a response after creation, a log or a URL.
6. It has a named test (`x-proof`).

## Who the UI is for

Three roles, all testable from the local Docker stack:

- **Administrator**: everything, through the schema-driven admin and the chat.
- **Organisation admin** (hosted/managed use): their own domains, mailboxes and policies.
- **User**: mail, calendar, contacts, files, password, app passwords, two-factor.

`deploy/local/seed.py` creates one persistent account for each role so every screen can be tried
as the person who will use it (see that file).

## Order of work

| Step | Work | Done when |
| --- | --- | --- |
| A1 | **Route table.** Replace the string match in `crates/http/src/api/mod.rs` with a table; generate `api/v1/openapi.yml` from it; one error shape | `check-api-coverage` compares table and spec; existing proofs still pass |
| A2 | **Move to `/api/v1`, delete `api/compat`.** Update `ui/src/lib/adapter/*`, e2e and `verify*.py` in the same change. No redirects | **Done 2026-11-16** except `token/*` and `live/*` (renamed to `/api/v1/token`, `/api/v1/live`; replaced in A4). Bare `/api/*` returns 404. Proven on the local stack: `verify_v1` 7, `verify_registry` 36, `verify_account` 25, `verify_panel` 51, `verify_compat` 15. `ui/e2e-live` is rewritten but not yet run |
| A3 | **Registry facade.** `/api/v1/registry/*` (REST over native JMAP, run as the caller); the Svelte admin and the actions use it instead of calling JMAP `x:` methods | **Server side and typed client done 2026-11-15** (`crates/http/src/api/registry_rest.rs`, `ui/src/lib/contract/registry.ts`, contracts generated from the schema; `deploy/local/verify_registry.py`, `ui/test-live/`). **Not done:** no screen calls it yet, so the admin still uses JMAP directly |
| A4 | **Events.** Replace `token/*` and `live/*` with `/events` | Delivery test and tracing screens work with no token route |
| A5 | **Fence the paid code** into its own crate (`RELEASE.md` C1) | Default build contains no SEL path; CI builds with and without it |
| A6 | **Layout.** Top-level grouping from B6.4 and a `crates/README.md` map | Image builds from the new layout |

### A3 follow-ups (found when the facade was proven, 2026-11-15)

Each has an owner step and a test that closes it. None is parked.

| Item | Why it matters | Closed by |
| --- | --- | --- |
| **First screen on the facade: Domains.** No screen imports `registry.ts` yet, so the bundle carries none of it | The facade and contracts are only proven by tests until a real screen uses them | Admin Domains list/create/edit/delete call `registryClient`; the three-role sign-in e2e passes; `verify_registry.py` stays green |
| **Code-split the runtime contracts.** `registry.generated.ts` is ~614 KB of source | A screen that imports it must not put it in the main bundle | Imported only from admin routes by dynamic import; `npm run build` shows it in its own chunk, not the entry chunk |
| **Nested patch paths** (`a/b: value`). The server accepts them; the update contract is typed for whole properties only | A form that edits one map entry would otherwise send the whole map | Decide from the JMAP patch rules (RFC 8620 5.3) whether the client exposes them; add a live test patching one entry of `Domain.aliases` |
| **Create on the 37 empty objects.** Only Domain has been through create, update and delete live | Read contracts for empty objects, and create contracts generally, are proven only against stored values | `verify_registry.py` creates, reads back and deletes one record of each object the seed account can create; objects that refuse are listed by name with the reason |
| **Exclude enterprise-flagged properties.** 30 are in the generated contracts | Public build must not describe paid features (A5) | `emit-registry.ts --without-enterprise` drops flagged properties; CI builds both outputs; the default output is chosen when A5 lands |

A1 to A3 are one coordinated change because the UI and the server must move together. Mail
protocols, DAV and OAuth discovery are untouched throughout.

## What is not decided

- Nothing about the registry transport: **decided 2026-11-15, both.** Native JMAP (RFC 8620, 8621
  and the registry `x:` methods) is the transport and stays the source of truth for mail and
  configuration. REST under `/api/v1/registry/*` is a thin facade over those same JMAP calls
  (one REST request becomes one JMAP method call; no logic of its own), for the chat, MCP, curl
  and the Svelte admin. The facade must never do something JMAP cannot.
- Whether to add 587, 143 and 110 listeners. Unrelated to this redesign; see `api/README.md`.
- The licence (`PLAN.md` B0). A5 depends on it.
