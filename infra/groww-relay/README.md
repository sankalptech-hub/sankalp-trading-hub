# groww-relay

A minimal static-IP forwarding proxy for the Groww Trading API. SEBI requires
order-placement calls to Groww's API to originate from a static IP registered
against the API key; Supabase edge functions don't have a static outbound IP,
so `groww-proxy` routes every Groww API call through this relay instead,
which runs on a VPS that does.

## Current deployment

- **Host**: Hetzner VPS `46.224.118.179` (hostname `ubuntu-32gb-nbg1-2`), also
  running other unrelated services (nginx, gitea, docker, a Cloudflare Tunnel).
- **Public URL**: `https://groww-relay.sankalp-tech.com`, exposed via the
  VPS's existing Cloudflare Tunnel (`/etc/cloudflared/config.yml`), not a
  directly-opened port. TLS is terminated by Cloudflare.
- **Local service**: `groww-relay.js` runs as the `groww-relay` systemd
  service, bound to `127.0.0.1:8200` only, as the `sankalp` user.
- **Auth**: every request must include a matching `X-Relay-Secret` header
  (checked against the `RELAY_SECRET` env var, set in
  `/etc/groww-relay/env` on the VPS) or gets a 403. The header is stripped
  before forwarding upstream to Groww.
- **Groww-side config**: the VPS's IP (`46.224.118.179`) must be registered
  as a static IP against the Groww API key(s) via groww.in → API Keys → Add
  static IP.

`groww-proxy` (`supabase/functions/groww-proxy/index.ts`) reads
`GROWW_RELAY_URL` (`https://groww-relay.sankalp-tech.com`) and
`GROWW_RELAY_SECRET` (must match `RELAY_SECRET` above) from Supabase edge
function secrets, and falls back to calling `api.groww.in` directly if either
is unset.

## Rebuilding from scratch

If the VPS is rebuilt or the service needs to be redeployed elsewhere:

```bash
# On the target host, as any user with sudo:
scp groww-relay.js root@<host>:/opt/groww-relay.js
ssh root@<host> '
  useradd -m relay 2>/dev/null  # or reuse an existing user
  chown relay:relay /opt/groww-relay.js
  mkdir -p /etc/groww-relay
  echo "RELAY_SECRET=$(openssl rand -hex 32)" > /etc/groww-relay/env
  echo "PORT=8200" >> /etc/groww-relay/env
  chmod 600 /etc/groww-relay/env
'
```

Then create `/etc/systemd/system/groww-relay.service`:

```ini
[Unit]
Description=Groww API relay (static IP forwarding)
After=network.target

[Service]
Type=simple
User=relay
EnvironmentFile=/etc/groww-relay/env
ExecStart=/usr/bin/node /opt/groww-relay.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now groww-relay
```

Expose it publicly however fits the host (Cloudflare Tunnel ingress rule,
reverse proxy with a real TLS cert, etc.) — it must be served over HTTPS
since Groww credentials and access tokens pass through it. Update
`GROWW_RELAY_URL`/`GROWW_RELAY_SECRET` in Supabase secrets to match.
