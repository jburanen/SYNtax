# NetTools

Browser-local network utilities served by nginx in Docker.
**No data ever leaves the user's browser.** All computation is pure client-side JavaScript.

## Quick Start

```bash
docker compose up -d --build
```

The app is available at **http://&lt;host&gt;:8080** (or whatever host is proxying port 80 on the `proxy_net` network).

---

## Directory Structure

```
nettools/
├── Dockerfile
├── docker-compose.yml
├── deploy.ps1              # push local files to server + git commit/push
├── server-setup.sh         # one-time server setup with GitHub webhook auto-deploy
├── nginx/
│   └── default.conf
└── html/                   # web root (bind-mounted into the container)
    ├── index.html
    ├── css/
    │   └── main.css
    └── js/
        ├── subnet.js       # pure calculation library
        └── app.js          # UI controller
```

---

## Docker Setup

The container is named `fwctl` and joins an external Docker network called `proxy_net` (expected to be created by a reverse proxy stack, e.g. Nginx Proxy Manager or Traefik).

```yaml
networks:
  default:
    name: proxy_net
    external: true
```

If you don't use an external proxy network, remove the `networks` block from `docker-compose.yml` before starting.

The `html/` directory and `nginx/default.conf` are bind-mounted read-only into the container, so you can edit files locally and see changes immediately without rebuilding (just reload the browser).

---

## Commands

| Command | Action |
|---------|--------|
| `docker compose up -d --build` | Build and start in background |
| `docker compose down` | Stop and remove containers |
| `docker compose build` | Rebuild image only |
| `docker compose logs -f fwctl` | Tail nginx logs |

### Changing the port

Edit `docker-compose.yml`:
```yaml
ports:
  - "0.0.0.0:9000:80"
```

---

## Deployment

### Manual deploy (Windows — deploy.ps1)

Pushes local files to the server via SCP and commits to GitHub in one step:

```powershell
.\deploy.ps1
# or with a commit message:
.\deploy.ps1 -m "fix subnet broadcast edge case"
```

Edit the variables at the top of `deploy.ps1` to match your server hostname and path.

### Automated deploy via GitHub webhook (server-setup.sh)

`server-setup.sh` is a one-time setup script for an Ubuntu server that:

1. Installs git, Docker, and the `webhook` daemon
2. Clones the repo to `/opt/nettools`
3. Writes a deploy script (`/usr/local/bin/nettools-deploy`) that pulls from GitHub and restarts the container
4. Configures a systemd service for the webhook listener
5. Opens the webhook port in ufw

```bash
chmod +x server-setup.sh
./server-setup.sh
```

Edit `GITHUB_USER`, `WEBHOOK_SECRET`, and other variables at the top of the script before running. After setup, add the displayed webhook URL to your GitHub repo under **Settings → Webhooks**.

---

## Features

### Subnet Calculator

- CIDR notation (`192.168.1.0/24`) or separate IP + mask (`255.255.255.0` or `/24`)
- Network, broadcast, first/last host, mask, wildcard, host counts
- Binary breakdown (IP, mask, network)
- Visual address-space map (proportional, colour-coded, up to 512 blocks)
- Subnet split — divide a network into equal smaller subnets (shows first 256)
- RFC scope detection (RFC 1918 private, loopback, link-local, multicast, etc.)
- Legacy IP class detection (A/B/C/D/E)
- One-click copy for any result value
- URL parameter support: `?q=10.0.0.0/8` auto-calculates on load
- Bare IP input defaults to `/32`

### Coming soon (placeholder nav entries)

- CIDR Aggregator
- IP Converter
- MAC Lookup
- Port Reference

---

## Security Notes

- `Content-Security-Policy` allows only `'self'` plus Google Fonts; `connect-src 'none'` blocks all outbound XHR/fetch.
- `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, and `Referrer-Policy: no-referrer` headers are set by nginx.
- Container runs nginx as the non-root `nginx` user.
- Static assets are served read-only from a bind mount.
- To go fully air-gapped, self-host JetBrains Mono and remove the Google Fonts entries from `index.html` and the CSP in `nginx/default.conf`.
