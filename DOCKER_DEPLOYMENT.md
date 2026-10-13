# DigiMenu Self-Hosted Docker Deployment Guide

This guide walks you through deploying the complete DigiMenu platform (frontend + full Supabase backend) on Docker with zero external cloud dependencies or subscription fees.

---

## 1. Architecture Overview

The DigiMenu self-hosted stack runs via Docker Compose and provides the complete backend infrastructure:

| Service | Container | Port | Role |
|---|---|---|---|
| **Web** | `digimenu-web` | `3000` | Production React SPA served via Nginx with security headers |
| **Gateway** | `digimenu-kong` | `54321` | Kong API gateway unifying Auth, REST, Realtime, and Storage APIs |
| **Database** | `digimenu-db` | `54322` | PostgreSQL 15 with `pgcrypto`, `pgvector`, and Row Level Security |
| **Auth** | `digimenu-auth` | `9999` (internal) | Supabase GoTrue Auth (JWTs, passwords, session management) |
| **REST API** | `digimenu-rest` | `3001` (internal) | PostgREST (auto-generated REST API enforcing RLS) |
| **Realtime** | `digimenu-realtime` | `4000` (internal) | WebSocket engine powering instant KDS and POS updates |
| **Storage** | `digimenu-storage` | `5000` (internal) | Object storage for menu photos and private payment proofs |
| **Studio** | `digimenu-studio` | `54323` | Supabase Web Dashboard UI for managing data and schemas |
| **Migrations** | `digimenu-migration-runner` | — | Automatically applies all 28 versioned migrations sequentially on startup |

---

## 2. Quickstart (Local Testing with Docker Desktop)

### Step 1: Ensure Docker is Running
Start **Docker Desktop** on your computer.

### Step 2: Configure Environment Variables
Copy the template configuration:
```powershell
Copy-Item .env.docker.example .env
```
*(The pre-configured defaults in `.env.docker.example` are already wired up for local testing).*

### Step 3: Start the Complete Stack
Run:
```powershell
docker compose up -d
```
or via npm:
```powershell
npm run docker:up
```

Docker will:
1. Download official Supabase images.
2. Spin up PostgreSQL and wait for it to be healthy.
3. Automatically execute all 28 SQL migrations in order (`digimenu-migration-runner`).
4. Seed demo accounts (if `SEED_DEMO_DATA=true`).
5. Build and launch the DigiMenu Web container.

### Step 4: Access Applications
* **Customer & Staff Web App:** [http://localhost:3000](http://localhost:3000)
* **Supabase Studio Dashboard:** [http://localhost:54323](http://localhost:54323)
* **Supabase API Gateway:** [http://localhost:54321](http://localhost:54321)

### Demo Accounts (Password: `Password1!`):
* **Superadmin:** `superadmin@lemi.test` → `/superadmin`
* **Admin/Owner:** `admin@lemi.test` → `/lemi-coffee/dashboard`
* **Cashier:** `cashier@lemi.test` → `/lemi-coffee/pos`
* **Barista (KDS):** `barista@lemi.test` → `/lemi-coffee/kds`
* **Customer Menu:** `/lemi-coffee/menu?table=1`

---

## 3. Production VPS Deployment (Hetzner, DigitalOcean, Linode, AWS)

### Step 1: Provision a Server
* Any Linux VPS with **2+ vCPUs** and **4GB+ RAM** (e.g. $5–$12/month on Hetzner or DigitalOcean).
* Install Docker & Docker Compose:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  ```

### Step 2: Clone Repository & Configure Secrets
1. Clone your repository:
   ```bash
   git clone https://github.com/siawatechnologies-source/DigiMenu.git /opt/digimenu
   cd /opt/digimenu
   ```
2. Generate production secrets:
   Generate a random 32+ character JWT secret:
   ```bash
   openssl rand -base64 32
   ```
   Generate random PostgreSQL password:
   ```bash
   openssl rand -hex 16
   ```
3. Update `.env`:
   - Set `POSTGRES_PASSWORD` to your generated password.
   - Set `JWT_SECRET` to your generated secret.
   - Generate matching `ANON_KEY` and `SERVICE_ROLE_KEY`.
   - Set `API_EXTERNAL_URL=https://api.yourdomain.com`
   - Set `SITE_URL=https://yourdomain.com`
   - Set `VITE_SUPABASE_URL=https://api.yourdomain.com`
   - Set `SEED_DEMO_DATA=false` (to keep production clean).

### Step 3: HTTPS Reverse Proxy (Caddy Example)
Caddy automatically manages free Let's Encrypt SSL certificates.

Create `/etc/caddy/Caddyfile`:
```caddyfile
# Frontend Web App
yourdomain.com {
    reverse_proxy localhost:3000
}

# Supabase API Gateway
api.yourdomain.com {
    reverse_proxy localhost:54321
}

# Optional: Supabase Studio (protect with basic auth or IP whitelist)
studio.yourdomain.com {
    basicauth {
        admin $2a$14$Z... # generated with caddy hash-password
    }
    reverse_proxy localhost:54323
}
```
Reload Caddy: `sudo systemctl reload caddy`.

---

## 4. Useful Operations & Commands

### View Logs
```bash
docker compose logs -f
# Or specific container:
docker compose logs -f web
docker compose logs -f migration-runner
```

### Stop / Restart Stack
```bash
docker compose down
docker compose up -d
```

### Database Backup
Export full database dump:
```bash
docker exec -t digimenu-db pg_dumpall -c -U postgres > backup_$(date +%F).sql
```

### Database Restore
```bash
cat backup.sql | docker exec -i digimenu-db psql -U postgres -d postgres
```
