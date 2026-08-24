# Single EC2 Deployment Guide — First AWS Test

Use this guide to validate the College Event Registration Platform on **one EC2 instance** before adding RDS, S3, a second server, and an Application Load Balancer.

```text
Browser → EC2 public IP / Elastic IP → Nginx → Next.js + Express → PostgreSQL
```

For this first test, the simplest database is PostgreSQL installed on the same EC2 instance. S3 document uploads are optional and can be added later. This is a learning/demo setup, not a highly available production configuration.

## What you need

- An AWS account
- This project pushed to GitHub (recommended) or available to copy to the server
- An SSH key pair (`.pem`) for EC2
- Your current public IP address for SSH access

GitHub is not mandatory, but it is the easiest way to copy the exact same source to EC2. Follow the GitHub section of [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md#1-put-the-source-code-in-github) if you have not pushed it yet. Never push `backend/.env` or `frontend/.env.local`.

## 1. Create an EC2 security group

In the EC2 console, create `college-single-ec2-sg` in your chosen VPC with these inbound rules:

| Type | Port | Source | Reason |
| --- | --- | --- | --- |
| SSH | 22 | **My IP** | Server administration only |
| HTTP | 80 | `0.0.0.0/0` | Access the website in a browser |

Do not open port 3000, port 5000, or PostgreSQL port 5432 publicly. Nginx will expose only port 80.

## 2. Launch one Ubuntu EC2 instance

1. Open **EC2** → **Launch instance**.
2. Name it `college-event-single-server`.
3. Select **Ubuntu Server 22.04 LTS** or newer.
4. Select an appropriate workshop instance type.
5. Choose/create your EC2 key pair and download its `.pem` file securely.
6. Select `college-single-ec2-sg`.
7. Launch the instance and wait until status is **Running**.
8. Copy its **Public IPv4 address**. For a stable address, allocate and associate an Elastic IP instead.

## 3. Connect to EC2

From a terminal in the folder containing your key file, connect with:

```bash
ssh -i college-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

On Windows PowerShell, make sure the `.pem` file is not accessible by other users if SSH reports an insecure permissions error.

## 4. Install PostgreSQL locally on EC2

On the EC2 server, run:

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Create an application database user and database. Replace `CHANGE_THIS_PASSWORD` with a strong password. If that password contains characters such as `@`, `#`, `:`, or `/`, you will URL-encode it later in `DATABASE_URL`.

```bash
sudo -u postgres psql
```

At the PostgreSQL prompt:

```sql
CREATE USER college_app WITH PASSWORD 'CHANGE_THIS_PASSWORD';
CREATE DATABASE college_events OWNER college_app;
\q
```

PostgreSQL remains reachable only locally by default; that is correct for this single-server test.

## 5. Clone the application and configure it

On EC2, clone the repository:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/college-event-platform.git
cd college-event-platform
```

For a private GitHub repository, configure a read-only deploy key or another approved authentication method before cloning.

Create the backend configuration:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Set it to the following, replacing the password. The PostgreSQL host must stay `localhost` for this guide:

```env
PORT=5000
SERVER_NAME=Single EC2 Server
DATABASE_URL=postgresql://college_app:CHANGE_THIS_PASSWORD@localhost:5432/college_events
DATABASE_SSL=false
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=
CORS_ORIGIN=http://localhost:3000
```

If your password was `Pass@123`, write `Pass%40123` in `DATABASE_URL`.

Create the frontend configuration with a blank API URL. This makes browser requests use the same hostname through Nginx:

```bash
printf 'NEXT_PUBLIC_API_URL=\n' > frontend/.env.local
```

## 6. Install Node.js, PM2, dependencies, and start the application

Run the project helper script:

```bash
chmod +x scripts/setup-ec2.sh
./scripts/setup-ec2.sh
pm2 status
```

The script installs Node.js and PM2, installs dependencies, builds Next.js, and starts the frontend and API.

Before exposing the application publicly, initialize the tables and sample events:

```bash
sudo apt-get install -y postgresql-client
PGPASSWORD='CHANGE_THIS_PASSWORD' psql \
  -h localhost \
  -U college_app \
  -d college_events \
  -f database/schema.sql
```

Test the API locally:

```bash
curl http://localhost:5000/api/health
```

It should return JSON containing `"status":"healthy"`, `"server":"Single EC2 Server"`, and `"database":"connected"`.

## 7. Configure Nginx

Nginx gives the application one public endpoint on port 80. It forwards page requests to Next.js on port 3000 and `/api/` requests to Express on port 5000.

```bash
sudo apt-get install -y nginx
sudo cp scripts/nginx.conf /etc/nginx/sites-available/college-event-platform
sudo ln -sf /etc/nginx/sites-available/college-event-platform /etc/nginx/sites-enabled/college-event-platform
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

Verify it on the server:

```bash
curl http://localhost/api/health
```

## 8. Test from your browser

Open this URL:

```text
http://YOUR_EC2_PUBLIC_IP
```

Verify the following:

1. The College Tech Fest page loads.
2. The header shows **Running on: Single EC2 Server**.
3. The AWS status panel shows the database as **connected**.
4. You can submit a registration without attaching a document.
5. The **Find your registration** section finds that registration by ID or email.

Confirm the data directly on EC2:

```bash
sudo -u postgres psql -d college_events -c 'SELECT registration_id, full_name, email, created_at FROM registrations ORDER BY created_at DESC;'
```

## Optional: Add S3 file uploads to the single server

Complete this only after normal registration works.

1. Create an S3 bucket in the same AWS Region.
2. Create an EC2 IAM role that permits `s3:PutObject` on `arn:aws:s3:::YOUR_BUCKET_NAME/registrations/*`.
3. Attach that role to the EC2 instance: **EC2** → **Instances** → select your instance → **Actions** → **Security** → **Modify IAM role**.
4. Edit `backend/.env`:

   ```env
   AWS_REGION=ap-south-1
   AWS_S3_BUCKET_NAME=YOUR_BUCKET_NAME
   ```

5. Restart the API:

   ```bash
   pm2 restart college-event-api
   ```

6. Submit a registration with a small document and verify it appears in the S3 bucket under `registrations/`.

Do not add static AWS access keys to the environment file. IAM roles are the intended EC2 credential method.

## Updating code on the single EC2 instance

After pushing changes to GitHub:

```bash
cd ~/college-event-platform
git pull origin main
npm --prefix backend install
npm --prefix frontend install
npm --prefix frontend run build
pm2 restart college-event-api
pm2 restart college-event-frontend
```

If you changed `frontend/.env.local`, rebuild the frontend. If you changed `backend/.env`, restart the backend.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Browser cannot open the website | Confirm EC2 is running, its security group allows HTTP 80, and `sudo systemctl status nginx` is active. |
| Nginx returns 502 | Run `pm2 status` and `pm2 logs`; the frontend or API process is likely stopped. |
| API says `database: unavailable` | Verify PostgreSQL: `sudo systemctl status postgresql`; validate credentials and database name in `backend/.env`. |
| API says password must be a string | `DATABASE_URL` has an empty/malformed password. Use `postgresql://USER:PASSWORD@localhost:5432/college_events`. |
| S3 upload fails | Verify the bucket name/region and that the EC2 instance IAM role allows `s3:PutObject` to the `registrations/*` prefix. |

## Next step: move to the full architecture

After this deployment works, use [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md). It replaces the local EC2 database with RDS, adds a second EC2 instance, gives each instance a different `SERVER_NAME`, and places both behind an Application Load Balancer for the load-balancing and failure demonstration.
