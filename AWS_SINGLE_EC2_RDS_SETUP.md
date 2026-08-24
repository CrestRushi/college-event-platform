# Single EC2 + Amazon RDS Deployment Guide

Use this guide to validate the application with its AWS database architecture before adding a second EC2 instance and an Application Load Balancer.

```text
Browser → EC2 public IP / Elastic IP → Nginx → Next.js + Express → Amazon RDS PostgreSQL
                                                              └──→ Amazon S3 (optional)
```

This deployment has **one application server** and **one separate, private RDS PostgreSQL database**. It is a useful first AWS test, but it is not highly available until you later add a second EC2 instance and an ALB.

## What you need

- AWS account and one AWS Region (examples use `ap-south-1`)
- A GitHub repository containing this project, or another secure way to copy it to EC2
- EC2 SSH key pair
- RDS PostgreSQL master username/password

GitHub is recommended but not required. If needed, first follow the GitHub section of [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md#1-put-the-source-code-in-github). Do not commit `backend/.env`, `frontend/.env.local`, RDS passwords, or AWS keys.

## 1. Create security groups

Create these security groups in the **same VPC**. This is essential: the EC2 security-group ID will be the RDS rule source.

| Name | Inbound rules | Purpose |
| --- | --- | --- |
| `college-one-ec2-sg` | SSH 22 from **your IP**; HTTP 80 from `0.0.0.0/0` | Public application server |
| `college-one-rds-sg` | PostgreSQL 5432 from **`college-one-ec2-sg`** | Private RDS access |

Do not open RDS port 5432 to your public IP or `0.0.0.0/0`. The database should accept traffic only from the EC2 application security group. AWS documents this security-group pattern for EC2-to-RDS connections in its [RDS guidance](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/security-groups.html).

## 2. Create the RDS PostgreSQL database

1. Open **Amazon RDS** → **Create database**.
2. Choose **Standard create** → **PostgreSQL**.
3. Select a suitable workshop instance class.
4. Enter a DB instance identifier, for example `college-event-db`.
5. Set and securely record the master username and password.
6. Under Connectivity, select the same VPC where EC2 will run.
7. Set **Public access** to **No**.
8. Select `college-one-rds-sg`.
9. Create the database and wait for status **Available**.
10. Copy the DB endpoint from RDS Connectivity & security. It resembles:

    ```text
    college-event-db.abc123xyz.ap-south-1.rds.amazonaws.com
    ```

RDS’s endpoint, port, and connection details are listed in the RDS console. The EC2 and RDS resources must be in the same VPC to use the security-group connection in this guide. See [AWS’s EC2/RDS connectivity documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/ec2-rds-connect.html).

## 3. Launch one EC2 application server

1. Open **EC2** → **Launch instance**.
2. Name it `college-event-server-1`.
3. Choose **Ubuntu Server 22.04 LTS** or newer.
4. Select a workshop-suitable instance type.
5. Select/create an SSH key pair.
6. Select the same VPC as RDS and attach `college-one-ec2-sg`.
7. Launch the instance and wait for it to be running.
8. Copy its public IPv4 address, or allocate an Elastic IP for a stable test URL.

## 4. Connect to the server and clone the project

From the folder containing your key:

```bash
ssh -i college-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

Clone the project:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/college-event-platform.git
cd college-event-platform
```

For a private GitHub repository, configure a read-only deploy key or other approved GitHub authentication method before cloning.

## 5. Configure the application

Create the backend configuration:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Set the following values. Replace the RDS values exactly; do not use `localhost` because PostgreSQL is on RDS, not on EC2.

```env
PORT=5000
SERVER_NAME=Server 1
DATABASE_URL=postgresql://YOUR_RDS_USERNAME:YOUR_URL_ENCODED_RDS_PASSWORD@YOUR_RDS_ENDPOINT:5432/college_events
DATABASE_SSL=true
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=
CORS_ORIGIN=http://localhost:3000
```

For example:

```env
DATABASE_URL=postgresql://postgres:Pass%40123@college-event-db.abc123xyz.ap-south-1.rds.amazonaws.com:5432/college_events
```

URL-encode special password characters: `@` becomes `%40`, `#` becomes `%23`, and `/` becomes `%2F`.

Create the frontend configuration. Keep the value blank so production browser requests call `/api` through Nginx on the same EC2 public hostname:

```bash
printf 'NEXT_PUBLIC_API_URL=\n' > frontend/.env.local
```

## 6. Install and initialize PostgreSQL on RDS

Install the PostgreSQL client on EC2. This does **not** install a local database server.

```bash
sudo apt-get update
sudo apt-get install -y postgresql-client
```

Create the application database on RDS (run once):

```bash
PGPASSWORD='YOUR_RDS_PASSWORD' psql \
  -h YOUR_RDS_ENDPOINT \
  -U YOUR_RDS_USERNAME \
  -d postgres \
  -c 'CREATE DATABASE college_events;'
```

Load tables and sample events:

```bash
PGPASSWORD='YOUR_RDS_PASSWORD' psql \
  -h YOUR_RDS_ENDPOINT \
  -U YOUR_RDS_USERNAME \
  -d college_events \
  -f database/schema.sql
```

If `CREATE DATABASE` reports that `college_events` already exists, continue to the schema command. It is safe to rerun the schema script.

## 7. Install Node.js, build, and start the application

Run the included EC2 setup helper:

```bash
chmod +x scripts/setup-ec2.sh
./scripts/setup-ec2.sh
pm2 status
```

It installs Node.js, PM2, dependencies, builds the frontend, and starts the Express API plus Next.js frontend.

Test the API from EC2:

```bash
curl http://localhost:5000/api/health
```

Expected output contains:

```json
{"status":"healthy","server":"Server 1","database":"connected"}
```

If it reports `database: unavailable`, stop here and check the RDS endpoint, credentials, RDS status, and the security-group rule from `college-one-ec2-sg` to `college-one-rds-sg`.

## 8. Configure Nginx

Nginx presents the application on port 80. It routes the frontend to port 3000 and `/api/` to port 5000.

```bash
sudo apt-get install -y nginx
sudo cp scripts/nginx.conf /etc/nginx/sites-available/college-event-platform
sudo ln -sf /etc/nginx/sites-available/college-event-platform /etc/nginx/sites-enabled/college-event-platform
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
curl http://localhost/api/health
```

The final command should return the same healthy response through Nginx.

## 9. Test in the browser

Open:

```text
http://YOUR_EC2_PUBLIC_IP
```

Verify:

1. The page loads and the header says **Running on: Server 1**.
2. The AWS status panel shows **Database: connected**.
3. You can submit a registration without a document.
4. The success panel shows a registration ID.
5. **Find your registration** returns it by registration ID or email.

Verify data directly in RDS from EC2:

```bash
PGPASSWORD='YOUR_RDS_PASSWORD' psql -h YOUR_RDS_ENDPOINT -U YOUR_RDS_USERNAME -d college_events \
  -c 'SELECT registration_id, full_name, email, created_at FROM registrations ORDER BY created_at DESC;'
```

## Optional: add S3 document uploads

After registration works, add S3:

1. Create an S3 bucket in the same Region and keep public access blocked.
2. Create an EC2 IAM role allowing `s3:PutObject` on:

   ```text
   arn:aws:s3:::YOUR_BUCKET_NAME/registrations/*
   ```

3. Attach the role to the EC2 instance: **EC2** → **Instances** → choose instance → **Actions** → **Security** → **Modify IAM role**.
4. Update `backend/.env`:

   ```env
   AWS_REGION=ap-south-1
   AWS_S3_BUCKET_NAME=YOUR_BUCKET_NAME
   ```

5. Restart Express:

   ```bash
   pm2 restart college-event-api
   ```

6. Submit a registration with a document, then check S3 for `registrations/REG-.../`.

Use an EC2 IAM role; never save AWS access keys in `.env`. The S3 object-permission format is described in the [AWS S3 IAM guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security_iam_service-with-iam.html).

## Updating the code

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

If you change `frontend/.env.local`, rebuild the frontend. If you change `backend/.env`, restart the API.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `database: unavailable` | RDS is Available; endpoint/password/user are correct; `DATABASE_SSL=true`; RDS SG permits PostgreSQL 5432 from the EC2 security group. |
| Connection timeout to RDS | EC2 and RDS must be in the same VPC (or connected networks); check both security groups and RDS public access remains disabled. |
| ALB not relevant yet | This guide has no ALB. Test via the EC2 public/Elastic IP only. |
| Web page but API error | Confirm `NEXT_PUBLIC_API_URL=` was blank before building; rerun `npm --prefix frontend run build` and restart `college-event-frontend`. |
| Nginx 502 | Run `pm2 status`, `pm2 logs`, and `sudo nginx -t`. |

## Next step

When this single-server/RDS deployment is working, proceed to [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md). That guide keeps the same RDS and S3 resources, adds Server 2, and places both servers behind an ALB for load balancing and failure recovery.
