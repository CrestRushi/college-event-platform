# College Event Registration Platform

A deliberately simple, workshop-ready demonstration of a real-world AWS web architecture. Students register for College Tech Fest events; two identical EC2 servers share PostgreSQL on Amazon RDS and upload optional files to Amazon S3. There is no Docker, Kubernetes, authentication, or microservice layer.

## Architecture

```text
Users → Application Load Balancer → EC2 Server 1 (SERVER_NAME=Server 1) ─┐
                              └→ EC2 Server 2 (SERVER_NAME=Server 2) ─┼→ Amazon RDS PostgreSQL
                                                                        └→ Amazon S3
```

Each EC2 runs the Next.js frontend (port 3000) and Express API (port 5000). Nginx, when used, presents both through port 80 and proxies `/api/` to Express. The ALB targets port 80. The web interface calls `/api/server-info` and shows the server name/hostname so routing is easy to demonstrate.

## Project layout

```text
frontend/   Next.js + React + Tailwind registration interface
backend/    Express API, PostgreSQL connection, S3 upload logic
database/   schema.sql (tables and sample events)
scripts/    EC2 setup helper and optional Nginx configuration
```

## API design

| Endpoint | Purpose |
| --- | --- |
| `GET /api/events` | Event catalogue |
| `POST /api/registrations` | Validate multipart registration, optionally upload document to S3, save to PostgreSQL |
| `GET /api/registrations` | Shared registration data for demonstration |
| `GET /api/registrations/search?registrationId=...&email=...` | Lookup matching registration(s) by registration ID and/or email |
| `GET /api/health` | ALB health check; always returns HTTP 200 while reporting database state |
| `GET /api/server-info` | Server name, hostname, timestamp, database and S3 configuration status |

The schema has an `events` catalogue and a `registrations` table. `registrations.event_id` is a foreign key to `events.id`; `registration_id` is unique. The optional `document_s3_key` and `document_url` point to S3 rather than placing files in the database or on EC2 disk.

## Local development

1. Install Node.js 22+ and PostgreSQL.
2. Create a database, then load the schema: `psql "$DATABASE_URL" -f database/schema.sql`.
3. Copy `backend/.env.example` to `backend/.env`; copy the frontend line from root `.env.example` into `frontend/.env.local`. A PostgreSQL URL needs a password (`postgresql://USER:PASSWORD@HOST:5432/DATABASE`); URL-encode special password characters such as `@` (`%40`). For local S3 testing, use normal AWS CLI credential configuration; never put keys in source code.
4. Install dependencies: `npm run install:all`.
5. Start the API: `npm --prefix backend run dev`.
6. In another terminal start the UI: `npm --prefix frontend run dev`.
7. Browse `http://localhost:3000`.

Use `SERVER_NAME=Server 1` locally. The API accepts a document of up to 10 MB. It obtains AWS credentials from the standard AWS SDK provider chain; when on EC2, attach an IAM role instead.

## RDS, S3, and IAM

Create an RDS PostgreSQL database reachable from the EC2 security group, create a `college_events` database, and run `database/schema.sql`. Set `DATABASE_URL` in each server’s `backend/.env`; set `DATABASE_SSL=true` for typical RDS connections.

Create an S3 bucket in `AWS_REGION`. Attach an EC2 instance role with least privilege for `s3:PutObject` to `arn:aws:s3:::YOUR_BUCKET/registrations/*` (and, if browsing uploaded objects in console is enough, no public-read permission is required). Set `AWS_S3_BUCKET_NAME` and `AWS_REGION`. The application uses IAM roles automatically through the AWS SDK.

## Deploy two EC2 servers

On each Ubuntu EC2 instance, copy or clone this repository, configure `backend/.env`, and set a different name:

```bash
SERVER_NAME=Server 1  # first instance
# SERVER_NAME=Server 2 on the second instance
```

Run `chmod +x scripts/setup-ec2.sh && ./scripts/setup-ec2.sh`. The script installs Node.js and PM2, installs packages, builds the frontend, and starts both processes. It is intentionally readable so it can be adjusted in the workshop. Review PM2 with `pm2 status` and logs with `pm2 logs`.

For a single-host public endpoint, install Nginx, copy `scripts/nginx.conf`, enable the site, and reload Nginx. With that configuration set `NEXT_PUBLIC_API_URL` to the same public origin (or leave it as the API host only if the browser can reach port 5000). For an ALB setup, use the ALB URL as the public origin and proxy `/api/` through Nginx.

## ALB and target group

1. Create an internet-facing Application Load Balancer in the same VPC.
2. Create an instance target group for HTTP port 80 and register both EC2 instances.
3. Configure the health check path as `/api/health`; success code `200`.
4. Allow ALB security group traffic to EC2 port 80; allow users to ALB port 80/443.
5. Access the ALB DNS name. Refreshing uses different targets when stickiness is disabled.

## High availability demo

Follow [WORKSHOP_DEMO.md](WORKSHOP_DEMO.md). In short: verify both targets healthy, show server identity while refreshing, submit one registration and inspect RDS/S3, then stop Server 1’s API. Once its health check fails, the ALB keeps the site operating through Server 2. Restart Server 1 with `pm2 start college-event-api`.

## Production note

This is intentionally an educational demo. Before a production use, add authentication, request rate limiting, private S3 object access/presigned URLs, stronger input/file validation, migrations, observability, backups, and TLS.
