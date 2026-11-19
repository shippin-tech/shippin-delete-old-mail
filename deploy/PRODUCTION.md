# The mail host and this repo

The mail host for shippin.ai is `mail.shippin.ai`. Do not publish
`mail.shippin.tech` as a mail host. The machine was set up by hand. This file
is the record of what that hand setup is, where `main` already matches it, and
what an operator does to move the host onto a build of `main`. Nothing here
connects to the host.

## What is running

Checked read-only on 2026-11-18. Compose project `shippin-mail` in
`/srv/shippin-tech/mail`, profile `bundled`.

| Piece | On the host |
| --- | --- |
| Mail image | `ghcr.io/shippin-tech/shippin-tech-scale:sha-6c8f37b352da4bdd9052afba599e7afb3770a0d1` |
| How that image was built | `docker buildx build --load -f Dockerfile.fdb` on the host, from a checkout of that commit. Not from CI. |
| That commit | Not an ancestor of current `main`. `main` was rewritten after the build. |
| FoundationDB | `foundationdb/foundationdb:7.4.6` |
| Object storage | `cgr.dev/chainguard/minio:latest` and `cgr.dev/chainguard/minio-client:latest`, bucket `mail` |
| NATS | `nats:2` with JetStream |
| Init | `alpine:3.22` for the bucket; FoundationDB `configure new single ssd` |
| Ports | 25, 465, 587, 993 and 443 on every interface. 8080 on 127.0.0.1. |
| Hostname env | `MAIL_HOSTNAME=mail.shippin.ai` |
| Outbound | Route `mx` (MX lookup) and route `local`. Strategy: local when `is_local_domain(rcpt_domain)`, otherwise `mx`. |
| Smarthost | Not installed. A route named `resend-temp` (Resend, `smtp.resend.com:465`, implicit TLS, username `resend`, sender domains `shippin.ai` and `notify.shippin.ai`) was removed on 2026-11-13. |
| Backup agent | Declared as `fdb-backup-agent` and never created. No backup timer and no cron. |
| Boot | `restart: unless-stopped` keeps the containers up. `shippin-tech-mail.service` points at `/srv/shippin-tech/node-a`, and `shippin-tech-infra.service` points at `/etc/shippin-tech/infra.compose.yaml`. Neither path exists. |

`config.json`, `update.sh` and `auto-update.sh` on the host match those files
at that commit, and those files on current `main` are the same bytes. The
container also has `shippin.tech_HEALTHCHECK_URL` and `shippin.tech_PORTAL_DIR`
from the image, not from compose.

Third-party tags are not pinned in compose, on the host or here. The digests
observed that day, so a later pull of `:latest` or `nats:2` can differ:

| Image | Digest observed |
| --- | --- |
| `foundationdb/foundationdb:7.4.6` | `sha256:1db13771714a1b2cc565c893e2ba768b5a3c33d101c84f2f6fda32f075cc8763` |
| `cgr.dev/chainguard/minio:latest` | `sha256:616286de6ef3a1892876b126e745e152d8e03add6357203f8a1f854bdd1dce76` |
| `cgr.dev/chainguard/minio-client:latest` | `sha256:10388d580a724f356b94c9b2631b5a179039cabe8c76e9b37d86ed007d569b05` |
| `alpine:3.22` | `sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f` |
| `nats:2` | `sha256:b6c40dcfe5ae9174dcafa9c43f800afb93b8b0ffcde02ac00efc6b66031d9a50` |

## What a fresh install from main already shares

`install.sh` writes `/srv/shippin-tech/mail`, project name derived from the
hostname, `COMPOSE_PROFILES=bundled`, the same FoundationDB, MinIO, NATS and
mail services, the same port variables (`HTTP_BIND=127.0.0.1`, `MAIL_BIND` and
`HTTPS_BIND` on `0.0.0.0`), and the same panel defaults (`PANEL_SIGNUP=closed`,
five mailboxes, 1024 MB, 200 sends a day). A new install passes
`shippin.tech_SETUP_KEY_HOURS` (24). The host's compose file does not. The
variable only affects a server that has not created its administrator yet.

## Intentional differences

Keep these. They are why the host must take a `main` image rather than
copying `6c8f37b` forward.

1. **Setup key lifetime.** `main` passes `SETUP_KEY_HOURS` (default 24). The
   deployed compose does not. An administrator that already exists is
   unchanged. A server still waiting on the setup key starts the 24 hour
   clock from when that key was made.
2. **`/api/v1/`.** `verify-install.sh` and the README call `/api/v1/setup` and
   `/api/v1/account`. The scripts on the host are the older copies. Use the
   `main` scripts with a `main` image.
3. **`backup.sh key`.** `main` can print the key-wrapping key. The deployed
   script cannot. Backups still omit that key, and they omit `secrets/`.
4. **Secret mount.** Compose mounts `./secrets/relay` at `/run/secrets/relay`
   read-only. The directory is empty until a relay is enabled. Applying the
   new compose recreates the mail container once. Outbound stays MX.
5. **One systemd unit and a backup timer.** `host.sh install` starts this
   directory's compose project on boot, including `fdb-backup-agent`, and
   removes `shippin-tech-mail.service` and `shippin-tech-infra.service` only
   when the paths in those units are missing. `backup.sh install` arms 03:15.
6. **CI image, not a hand build.** See README, "Images are built by CI".

## Move this host onto main

Do this on the host, from the instance directory, after a CI image exists for
the commit you want. Do not build on the host. Do not push a `v*` tag while
[RELEASE.md](../RELEASE.md) has rows that are not Done or Waived: that moves
`:release`.

```sh
cd /srv/shippin-tech/mail
sudo bash backup.sh
cp server.env server.env.before-main
REF=main
for f in compose.yaml update.sh auto-update.sh verify-install.sh backup.sh host.sh relay.sh relay.py relay.env.example README.md PRODUCTION.md; do
  curl -fsSL "https://raw.githubusercontent.com/shippin-tech/shippin-tech/$REF/deploy/$f" -o "$f"
done
chmod +x update.sh auto-update.sh verify-install.sh backup.sh host.sh relay.sh relay.py
[[ -f relay.env ]] || cp relay.env.example relay.env
mkdir -p secrets/relay
# optional; compose already defaults this to 24
grep -q '^SETUP_KEY_HOURS=' server.env || echo 'SETUP_KEY_HOURS=24' >> server.env
bash update.sh --check
bash update.sh ghcr.io/shippin-tech/shippin-tech-scale:sha-<full commit from the workflow>
sudo bash host.sh install
sudo bash verify-install.sh
sudo bash relay.sh status
```

`relay.sh status` should report the relay off and no sender-domain rule.
Leave it off. Direct MX is what the host does now.

`host.sh install` replaces the two units that point at missing paths. The
containers are the ones `restart: unless-stopped` was already keeping. The
first `update.sh` recreates the mail container because the compose file gains
the secret mount and `SETUP_KEY_HOURS`. Accounts and mail stay in FoundationDB
and the bucket.

To use the smarthost again later, follow README, "Outbound smarthost". For
the scope that route used to have, `RELAY_DOMAINS=shippin.ai,notify.shippin.ai`
and `RELAY_HOST=smtp.resend.com`. The key goes in `secrets/relay/relay.key`,
not in git.

## Follow-ups

- The admin nav does not show Settings → MTA → Outbound → Routes or Strategy.
  Those views are in `resources/schema/schema.json.gz`. `ui/scripts/emit-portal.ts`
  `walk()` keeps a single level of children, and MTA is a container of
  containers, so the whole menu is dropped. Fixing that walker (and the nav,
  if it needs a third level) makes the relay selectable in the existing
  registry editor. This change does not add a second form.
- Off-host backup is a documented `rsync`. No remote is configured, because
  this repo has nowhere to put that destination.
- [RELEASE.md](../RELEASE.md) B4 (deliverability and reverse DNS for
  `mail.shippin.ai`), B5 (timer and off-host copy on the real host) and B6
  (this host actually running `update.sh --check`) stay open until someone
  with access to the machine does them.
