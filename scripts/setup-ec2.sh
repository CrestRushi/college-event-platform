#!/usr/bin/env bash
# Simple Ubuntu EC2 setup. Edit FRONTEND_API_URL if Nginx will proxy /api.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_API_URL="${NEXT_PUBLIC_API_URL:-}"

sudo apt-get update
sudo apt-get install -y curl git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

cd "$ROOT_DIR"
npm --prefix backend install
npm --prefix frontend install
printf 'NEXT_PUBLIC_API_URL=%s\n' "$FRONTEND_API_URL" > frontend/.env.local
npm --prefix frontend run build
pm2 delete college-event-api 2>/dev/null || true
pm2 delete college-event-frontend 2>/dev/null || true
pm2 start backend/src/server.js --name college-event-api
pm2 start npm --name college-event-frontend --cwd frontend -- start
pm2 save
pm2 startup
echo "Deployment started. Ensure backend/.env has RDS, S3, and SERVER_NAME settings."
