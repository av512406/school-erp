# School ERP — Production Deployment Guide

This document is a focused, step-by-step guide to deploy the School ERP application to production. It assumes you want a reliable, repeatable process for a small-to-medium deployment (one VPS or small managed services).

Choose the parts that match your infrastructure (VPS, managed DB, or managed hosting). This guide shows both a single-server approach (Docker Compose or systemd) and recommended managed-service options.

---

## Quick checklist (high level)

- Domain name and DNS control
- TLS certificates (Let's Encrypt or managed certs)
- Node 18+ on the server (or Docker)
- Postgres (managed or self-hosted)
- S3-compatible storage for file attachments (AWS S3, DO Spaces, etc.)
- Secrets management (env files or secret manager)
- CI pipeline (recommended)

---

## 1. Prepare environment & secrets

Create an `.env` for the server and (optionally) a `.env.production` for client build-time variables. Never commit secrets to Git. Add a `.env.example` to the repo for developer convenience.

Example server `.env` (place in server host or secrets manager):

```env
# Database
DATABASE_URL=postgres://school_erp:school_erp_pass@localhost:5432/school_erp

# Node
NODE_ENV=production
PORT=3000

# Storage (S3-compatible)
STORAGE_PROVIDER=s3
S3_BUCKET=school-erp-files
S3_REGION=ap-south-1
S3_KEY=YOUR_S3_KEY
S3_SECRET=YOUR_S3_SECRET
S3_ENDPOINT= (optional, e.g. DO Spaces)

# Firebase / Auth (if used server-side)
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Example client `.env` (Vite environment variables prefixed with VITE_):

```env
VITE_API_BASE_URL=https://app.yourschool.org
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
```

Security notes
- Prefer a hosted secrets manager (AWS Secrets Manager, HashiCorp Vault, or cloud provider secrets) for production.
- If using `.env` files, store them outside the repository and restrict file permissions (600).

---

## 2. Prepare Postgres

Option A — Managed Postgres (recommended):
- Use Supabase, AWS RDS, or other managed Postgres. Create database, user, and set `DATABASE_URL` in secrets.

Option B — Self-hosted (Docker Compose example):

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: school_erp
      POSTGRES_PASSWORD: school_erp_pass
      POSTGRES_DB: school_erp
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "15432:5432"

volumes:
  postgres-data:
```

Bring it up:

```bash
docker compose up -d postgres
```

Wait until Postgres accepts connections. Verify with:

```bash
PGPASSWORD=school_erp_pass psql -h localhost -p 15432 -U school_erp -d school_erp -c "SELECT 1"
```

---

## 3. Migrations (Drizzle)

This project includes a `drizzle.config.ts`. For production, use formal migrations instead of runtime table creation helpers.

Generate and push migrations with drizzle-kit:

```bash
# one-time: generate a migration after schema changes
npx drizzle-kit generate --out migrations --config ./drizzle.config.ts
# inspect SQL in migrations, then apply
npx drizzle-kit push --config ./drizzle.config.ts
```

If you prefer manual SQL, create reviewed SQL files and apply them to the DB.

---

## 4. Build the frontend

On your CI or build server:

```bash
cd client
npm ci
npm run build
# build artifacts will be in client/dist (Vite default)
```

Deploy `client/dist` to a static host:
- Vercel or Netlify (simple, managed)
- Firebase Hosting
- Or copy to a VPS and serve with Nginx (instructions below)

Nginx static host (example):

```nginx
server {
  listen 80;
  server_name app.yourschool.org;
  root /var/www/school-erp;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

---

## 5. Build & run the server (Express)

Option A — systemd on a VPS

1. Install Node 18+ and clone the repo to `/srv/school-erp`.
2. On the server:

```bash
cd /srv/school-erp
git pull origin main
npm ci --production
npm run build    # builds server into dist/
NODE_ENV=production DATABASE_URL="postgres://..." PORT=3000 node dist/index.js
```

Create a systemd unit `/etc/systemd/system/school-erp.service`:

```ini
[Unit]
Description=School ERP server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/school-erp
ExecStart=/usr/bin/node /srv/school-erp/dist/index.js
Environment=NODE_ENV=production
Environment=DATABASE_URL=postgres://...  # prefer EnvironmentFile
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Reload systemd and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable school-erp
sudo systemctl start school-erp
sudo journalctl -u school-erp -f
```

Option B — Docker Compose (all-in-one)

Create `docker-compose.prod.yml` (example skeleton) with services: `postgres`, `app`, `nginx` (reverse proxy), and optionally `certbot`.

Bring up and build:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 6. Reverse proxy & TLS (Nginx + Certbot)

Nginx config (proxy API to Node and serve static):

```nginx
server {
  listen 80;
  server_name app.yourschool.org;

  location /api/ {
    proxy_pass http://127.0.0.1:3000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    root /var/www/school-erp;
    try_files $uri $uri/ /index.html;
  }
}
```

Obtain certificates:

```bash
sudo certbot --nginx -d app.yourschool.org
```

Set up auto-renewal (certbot usually does this automatically).

---

## 7. File storage (payslips)

Use S3-compatible storage. In the server, implement signed URLs for downloads and restrict bucket access.

Example flow:
- Upload payslip (server uploads file to S3 and stores URL/path in DB)
- When user downloads, server returns a presigned URL (short TTL)

---

## 8. Backups & restores

Daily Postgres dumps to S3 is a simple approach.

Example cron script (`/etc/cron.daily/pg_backup`):

```bash
#!/bin/bash
set -e
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
OUT=/tmp/school_erp_backup_${TIMESTAMP}.sql.gz
pg_dump "$DATABASE_URL" | gzip > "$OUT"
aws s3 cp "$OUT" s3://your-backup-bucket/school-erp/
rm "$OUT"
```

Test restore periodically:

```bash
# restore into test DB
gunzip -c backup.sql.gz | psql -h <host> -U <user> -d <testdb>
```

---

## 9. Monitoring & logging

- Logging: structured JSON logs; ship to a log provider or rotate locally.
- Error reporting: Sentry or similar.
- Metrics: expose key metrics and use Prometheus or provider metrics.

Add a `/health` endpoint to confirm DB and storage connectivity for load balancers.

---

## 10. CI/CD (GitHub Actions example)

A minimal action:

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Use Node
        uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Install
        run: npm ci
      - name: Typecheck
        run: npm run check
      - name: Build client
        run: |
          cd client
          npm ci
          npm run build
      - name: Build server
        run: npm run build
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v0.1.7
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /srv/school-erp
            git pull origin main
            npm ci --production
            npm run build
            sudo systemctl restart school-erp
```

Securely provide secrets in the GitHub repository settings.

---

## 11. Rollback strategy

Keep the previously deployed commit or Docker image available. Rollback example (server):

```bash
cd /srv/school-erp
git checkout <previous-commit-or-tag>
npm ci --production
npm run build
sudo systemctl restart school-erp
```

For Docker, re-deploy the previous image tag.

---

## 12. Post-deploy checklist

- Smoke test login, student listing, CSV import, generate payslip and print.
- Check logs for startup warnings.
- Verify backups were created and uploaded.
- Check TLS certificate and site accessibility.

---

## Appendix — Useful commands

Start Postgres via docker-compose:

```bash
docker compose up -d postgres
```

Build client and copy to Nginx static directory:

```bash
cd client
npm ci
npm run build
sudo rm -rf /var/www/school-erp/*
sudo cp -r dist/* /var/www/school-erp/
```

Start server (direct):

```bash
cd /srv/school-erp
npm ci --production
NODE_ENV=production DATABASE_URL="postgres://user:pass@localhost:15432/school_erp" PORT=3000 node dist/index.js
```

---

If you'd like, I can also:

- Generate a `docker-compose.prod.yml` ready for a single-VPS deployment (Postgres, app, Nginx, Certbot).
- Add a `/.github/workflows/deploy.yml` GitHub Actions workflow (complete file) that builds and deploys.
- Create a `.env.example` file listing required variables and placeholders.

Tell me which of those you'd like me to add and I'll create them in the repo.
