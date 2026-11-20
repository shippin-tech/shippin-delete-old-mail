#!/usr/bin/env python3
"""Writes roadmap/capabilities.csv, the capability ledger the roadmap and the regression run share.

One row per capability the product has or must have. `status` is what is proven today:
  verified          an automated test in this repository exercised it against the running server
  engine-suite-only only the inherited Rust suite (tests/) covers it, and CI does not run that yet
  mocked-only       a test with a fake server; adapter evidence, not interoperability
  unverified        a check exists but is too thin to count (a greeting, a read, a sign-in)
  gap               not built, or no check at all
A row only becomes `verified` by a test that was run; edit this file together with that test.
"""

import csv
from collections import Counter
from pathlib import Path

H = ["id", "floor_area", "capability", "engine_crates", "surface", "evidence", "status", "gap_and_next"]
V, E, U, G, M = "verified", "engine-suite-only", "unverified", "gap", "mocked-only"
MAIL = "Mail and clients"
CAL = "Calendar, contacts, files and filtering"
IDN = "Identity and administration"
INT = "Integrations and AI"
OPS = "Persistence and operations"
UXP = "User experience and performance"

ROWS = [
    ("M1", MAIL, "SMTP inbound delivery to local mailboxes", "smtp, email, store", "port 25/587",
     "deploy/local/verify.py; ui/e2e-live/free-plan.spec.ts", V,
     "Failure reports and oversize/abuse limits only in the engine suite"),
    ("M2", MAIL, "SMTP submission, authentication, relay refusal", "smtp, directory", "port 587/465",
     "deploy/local/verify_panel.py (outside-domain refusal); ui/e2e-live/split-domain.spec.ts", V,
     "Rate limits and quota refusals: engine suite only"),
    ("M3", MAIL, "Outbound queue, retries, delay and failure reports", "smtp (queue)", "SMTP",
     "tests/src/smtp/queue", E, "No repo-level check. B4 (real deliverability) is owed on the host"),
    ("M4", MAIL, "DKIM, SPF, DMARC, ARC sign and verify; MTA-STS, DANE", "smtp, common (mail-auth)", "SMTP",
     "tests/src/smtp (auth); RELEASE B4", E, "Repo-level proof needs a real domain (B1, B4)"),
    ("M5", MAIL, "IMAP: folders, flags, search, byte-exact fetch", "imap, imap-proto, email", "port 143/993",
     "deploy/local/verify.py and verify_account.py (sign-in and read); tests/src/imap", U,
     "Only sign-in and read are proven by an independent client here. Flags, search, move, IDLE need a client suite"),
    ("M6", MAIL, "POP3", "pop3", "port 110/995",
     "tests/src/imap (pop3 cases); deploy/local/verify_compat.py greeting only", U,
     "A greeting is not proof. Add a retrieve and delete round trip"),
    ("M7", MAIL, "Webmail over JMAP: list, read, thread, flags", "jmap, email", "/jmap",
     "ui/e2e-live/free-plan.spec.ts; ui/e2e/mail-reader.spec.ts (mocked)", V, "-"),
    ("M8", MAIL, "Compose, reply, forward, drafts, attachments byte-for-byte", "jmap, email", "/jmap",
     "ui/e2e-live/free-plan.spec.ts (RELEASE A3)", V, "-"),
    ("M9", MAIL, "Mail search (full text, filters)", "email, store, nlp", "/jmap",
     "ui/e2e/search.spec.ts (mocked, operator portal)", U, "No live search check for webmail. Add one"),
    ("M10", MAIL, "Spam filter, greylisting, reputation, learning", "spam-filter", "SMTP",
     "tests/src/smtp (antispam); RELEASE F9 open", E, "Model-backed classification (F9) is open"),
    ("M11", MAIL, "Masked addresses", "email, common/shippin", "/jmap, /api/v1",
     "ui/e2e-live/masked.spec.ts", V, "Receiving only"),
    ("M12", MAIL, "Undelete of messages and accounts", "email, common/shippin", "/api/v1",
     "ui/e2e-live/recover.spec.ts", V, "Files, calendars and contacts deleted alone are not kept"),
    ("M13", MAIL, "Split-domain relay to another provider", "smtp, common/shippin", "SMTP",
     "ui/e2e-live/split-domain.spec.ts (stand-in relay)", V, "Real Google relay (H2) owed"),
    ("C1", CAL, "Calendar events, repeats, calendars, invitations and replies", "groupware, jmap", "/jmap",
     "ui/e2e-live/calendar.spec.ts", V, "-"),
    ("C2", CAL, "Invitation and reminder email templates", "groupware, common/shippin", "/api/v1",
     "ui/e2e-live/calendar-templates.spec.ts", V, "The RSVP page is our own Svelte page"),
    ("C3", CAL, "Contacts", "groupware, jmap", "/jmap", "ui/e2e-live/contacts.spec.ts", V, "-"),
    ("C4", CAL, "CalDAV, CardDAV, WebDAV", "dav, dav-proto, groupware", "/dav", "tests/src/webdav", E,
     "No repo-level check with an independent DAV client. Add one"),
    ("C5", CAL, "Drive: upload, folders, rename, move, share, ACL, cross-domain wall", "jmap (filenode)", "/jmap",
     "ui/e2e-live/drive.spec.ts; drive-share.spec.ts", V, "-"),
    ("C6", CAL, "Docs: write, format, autosave", "jmap (filenode)", "/jmap", "ui/e2e-live/docs.spec.ts", V, "-"),
    ("C7", CAL, "Sieve filtering: user scripts, ManageSieve, editor", "managesieve, email (sieve-rs)",
     "port 4190, /jmap", "tests/src/smtp (sieve); no UI", G,
     "Svelte Sievepad is open (porting P2). ManageSieve has no repo-level check"),
    ("I1", IDN, "First sign-in: single-use setup key, create the real administrator", "http, common", "/login",
     "ui/e2e-live/first-run.spec.ts (RELEASE A6)", V, "-"),
    ("I2", IDN, "Password change, app passwords, two-factor, IMAP app-password sign-in", "directory, http",
     "/api/v1, IMAP", "deploy/local/verify_account.py (25 checks)", V, "-"),
    ("I3", IDN, "Per-domain OpenID Connect sign-in", "directory, common/shippin", "/api/v1/sso",
     "ui/e2e-live/sso.spec.ts (stand-in provider)", V, "Per-domain LDAP is not built; a real identity provider is owed"),
    ("I4", IDN, "SCIM provisioning", "scim, scim-proto", "/api/v1/scim/v2",
     "ui/e2e-live/scim.spec.ts; tests/src/scim", V, "eq filters only; real Okta or Entra owed"),
    ("I5", IDN, "Roles, organisations, people and teams, quotas, cross-account isolation",
     "directory, common/shippin", "/api/v1",
     "ui/e2e-live/org.spec.ts; people.spec.ts; deploy/local/verify_v1.py", V,
     "No seeded organisation-admin account for the org role in verify_v1"),
    ("I6", IDN, "Administrative CRUD over the registry, stale-write rejection", "registry, http",
     "/api/v1/registry",
     "deploy/local/verify_registry.py (51); ui/test-live; ui/e2e-live/admin-*.spec.ts", V,
     "Create/read round trips on 37 empty objects, nested patch paths and typed editors are open"),
    ("I7", IDN, "Free-plan signup with DNS proof, /manage, limits, closure", "http, common/shippin",
     "/api/v1/panel", "deploy/local/verify_panel.py; ui/e2e-live/free-plan.spec.ts", V,
     "Real DNS proof (B1) owed"),
    ("I8", IDN, "Service keys: one key, one job", "common/shippin", "/shippin/admin/keys",
     "ui/e2e-live/keys.spec.ts", V, "-"),
    ("I9", IDN, "OAuth/OIDC provider for mail clients, device flow", "http, directory", "/auth, /oauth",
     "tests/src/system; ui/e2e-live/first-run.spec.ts (browser flow)", U,
     "No independent client check of XOAUTH2 for IMAP and SMTP"),
    ("G1", INT, "Google Drive connection, copy and download", "common/shippin", "/api/v1/google",
     "ui/e2e-live/google.spec.ts (stand-in Google)", M,
     "Real consent needs the owner's OAuth client (REGRESSION gate 4)"),
    ("G2", INT, "Microsoft 365 files connection", "ui adapter", "/api/v1", "ui/e2e/integrations.spec.ts (mocked)",
     M, "No server side and no live check yet"),
    ("G3", INT, "AI assistant and MCP drive with approvals", "http (assistant, mcp)",
     "/api/v1/mcp, /api/v1/assistant", "ui/e2e-live/assistant.spec.ts; mcp.spec.ts", V,
     "Model-backed spam and Sieve prompt (F9) open"),
    ("G4", INT, "MCPL lessons with server-kept progress", "http (learn)", "/api/v1/learn",
     "ui/e2e-live/learn.spec.ts; scripts/check-mcpl.mjs", V, "Variant comparison is the owner's (M1)"),
    ("O1", OPS, "Metrics dashboard on our own sampler", "common/shippin (stats)", "/api/v1/stats",
     "ui/e2e-live/dashboard.spec.ts", V, "-"),
    ("O2", OPS, "Live tracing and trace history", "trc, common/shippin", "/api/v1/live",
     "ui/e2e-live/tracing.spec.ts", V, "-"),
    ("O3", OPS, "Alerts to email and webhook", "common/shippin", "/api/v1", "ui/e2e-live/alerts.spec.ts", V, "-"),
    ("O4", OPS, "Install, upgrade from v0.1.2, rollback, restart survival", "deploy", "install.sh, update.sh",
     "deploy/verify-install.sh (7); deploy/*.test.sh; RELEASE A7, A8, B6", V,
     "The same on a Linux host is owed (B3, B6)"),
    ("O5", OPS, "Backup and restore with a content check", "deploy", "backup.sh",
     "deploy/backup.test.sh; RELEASE B5", V, "Scheduled run and off-machine copy owed on the host"),
    ("O6", OPS, "TLS certificate issuance (ACME)", "common (acme)", "port 443", "none", G,
     "RELEASE A10 is open"),
    ("O7", OPS, "Scale stores (FoundationDB, S3, NATS, SQL, Redis) and cluster coordination",
     "store, coordinator", "config", "tests/src/store; tests/src/cluster; local stack runs the scale image", E,
     "Only the shipped combination is exercised. F11 is open"),
    ("O8", OPS, "Host monitoring with an alert channel", "deploy", "-", "none", G,
     "RELEASE D3 needs a channel chosen"),
    ("O9", OPS, "Data migration from earlier layouts", "migration", "update.sh",
     "deploy/update.test.sh; RELEASE A8", V, "Import from another mail server's layout is not built"),
    ("U1", UXP, "Accessibility: axe scans on signup, manage, account, compose, calendar", "ui", "browser",
     "ui/e2e-live (axe in specs)", V, "Keyboard-only and mobile-width flows are not asserted"),
    ("U2", UXP, "Svelte is the only UI; every registry object is reachable", "ui, registry", "/shippin/admin",
     "ui/e2e-live/admin-shell.spec.ts; ui/test-live/registry-live.test.ts", V,
     "Typed editors for the largest objects (porting P2)"),
    ("U3", UXP, "Latency, throughput and memory against a baseline with thresholds", "all", "-", "none", G,
     "REGRESSION gate 3. Build the fixture and record the baseline before any engine slice is replaced"),
]


def main() -> None:
    out = Path(__file__).with_name("capabilities.csv")
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(H)
        w.writerows(ROWS)
    print(f"wrote {out.name}: {len(ROWS)} rows", dict(Counter(r[6] for r in ROWS)))


if __name__ == "__main__":
    main()
