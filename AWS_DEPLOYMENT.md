# AWS Deployment Guide — College Event Registration Platform

This guide deploys the application as a workshop demonstration:

```text
Internet → Application Load Balancer → EC2 Server 1 and EC2 Server 2 → RDS PostgreSQL
                                                                  └──→ S3 documents
```

The two EC2 servers run identical application code. They use the same RDS database and S3 bucket. Their only application configuration difference is `SERVER_NAME`.

## Before you begin

You need an AWS account that can create EC2, RDS, S3, IAM roles, security groups, and an Application Load Balancer. Complete the local setup first and make sure you can submit a registration locally.

Choose one AWS Region and use it consistently for every resource in this guide. The examples use `ap-south-1`; substitute your chosen Region if different.

> **Cost warning:** EC2, RDS, public IPv4 addresses, an Application Load Balancer, and S3 can incur charges. Delete workshop resources after use if you no longer need them.

## 1. Put the source code in GitHub

GitHub is not mandatory: you could copy the project to each server with SCP or a ZIP file. It is strongly recommended because both EC2 instances can clone exactly the same version and later pull updates reliably.

1. Create a new **private** GitHub repository, for example `college-event-platform`. Do not initialize it with a README if your local project already has one.
2. In PowerShell, from the application folder, check that the environment files will not be committed:

   ```powershell
   cd D:\awsdemo
   git status --ignored
   ```

   Ensure `backend/.env` and `frontend/.env.local` appear as ignored. Never commit database passwords or AWS keys.
3. Commit and push the project:

   ```powershell
   git init
   git add .
   git commit -m "Initial College Event Platform deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/college-event-platform.git
   git push -u origin main
   ```

   Authenticate with GitHub when prompted. If `git init` was already run, omit that command. For a private repository, EC2 needs a GitHub deploy key, GitHub token, or another approved way to clone it. A deploy key with read-only access is a good workshop choice.

## 2. Create security groups

Create three security groups in the same VPC. Use security-group references—not broad public CIDR rules—for traffic inside the architecture.

| Security group | Inbound rules | Purpose |
| --- | --- | --- |
| `college-alb-sg` | HTTP 80 from `0.0.0.0/0`; HTTPS 443 from `0.0.0.0/0` if using TLS | Public load balancer |
| `college-ec2-sg` | HTTP 80 **from `college-alb-sg`**; SSH 22 **from your own public IP only** | Application servers |
| `college-rds-sg` | PostgreSQL 5432 **from `college-ec2-sg`** | Private database access |

Do not open RDS port 5432 to the internet. AWS recommends allowing EC2 access to RDS by using the EC2 security group as the source. See [AWS RDS security-group guidance](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/security-groups.html).

## 3. Create an S3 bucket

1. Open **Amazon S3** → **Create bucket**.
2. Use a globally unique name, such as `college-event-documents-YOURNAME-2026`.
3. Select your Region and keep **Block all public access** enabled.
4. Create the bucket. No folder needs to be created manually; the application creates `registrations/REG-.../` when uploading.

## 4. Create an EC2 IAM role for S3

The application uses AWS SDK’s standard credential chain. On EC2, do **not** create AWS access-key files or put access keys in `.env`; attach an IAM role to the instances instead.

1. Open **IAM** → **Roles** → **Create role**.
2. Choose **AWS service** → **EC2**.
3. Name it `CollegeEventEc2S3Role`.
4. Add this inline policy, replacing `YOUR_BUCKET_NAME` exactly:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": "s3:PutObject",
       "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/registrations/*"
     }]
   }
   ```

5. Create the role.

`s3:PutObject` applies to an object ARN, including the bucket prefix; AWS documents the object ARN form in its [S3 IAM guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security_iam_service-with-iam.html). The same IAM role can be attached to both servers; AWS describes how to [attach an IAM role to EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/attach-iam-role.html).

## 5. Create PostgreSQL on Amazon RDS

1. Open **Amazon RDS** → **Create database**.
2. Select **Standard create**, engine **PostgreSQL**, and an appropriate workshop/free-tier eligible instance type if available in your account.
3. Set a DB instance identifier, e.g. `college-event-db`.
4. Set master username/password and store them securely. Do not reuse the local password unless intentional.
5. Choose the same VPC as the EC2 servers. Set **Public access** to **No**.
6. Assign `college-rds-sg` as its security group.
7. Create the database and wait for status **Available**.
8. Copy its endpoint, which resembles `college-event-db.xxxxxx.ap-south-1.rds.amazonaws.com`.

RDS offers an EC2 connectivity setup flow when resources are in the same VPC, but the explicit security-group setup above is easier to explain in a workshop. Refer to [AWS’s EC2-to-RDS connectivity documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/ec2-rds-connect.html).

### Initialize the RDS database

After Server 1 is available, SSH into it and run this once. Replace the endpoint, password, and database name as necessary:

```bash
sudo apt-get update
sudo apt-get install -y postgresql-client
PGPASSWORD='YOUR_RDS_PASSWORD' psql \
  -h YOUR_RDS_ENDPOINT \
  -U YOUR_RDS_USERNAME \
  -d postgres \
  -c 'CREATE DATABASE college_events;'
```

Then, after cloning the repository in Step 7, load the schema:

```bash
PGPASSWORD='YOUR_RDS_PASSWORD' psql \
  -h YOUR_RDS_ENDPOINT \
  -U YOUR_RDS_USERNAME \
  -d college_events \
  -f database/schema.sql
```

If the database already exists, do not repeat `CREATE DATABASE`; `schema.sql` is safe to rerun for its tables and sample events.

## 6. Launch two EC2 instances

1. Open **EC2** → **Launch instance**.
2. Choose Ubuntu 22.04 LTS or newer.
3. Choose an instance size suitable for the workshop.
4. Select the same VPC as RDS and a subnet in an ALB-enabled Availability Zone. For stronger availability, place Server 1 and Server 2 in different Availability Zones.
5. Attach `college-ec2-sg`.
6. Under **Advanced details**, select IAM instance profile `CollegeEventEc2S3Role`.
7. Launch the first instance and name/tag it `college-event-server-1`.
8. Repeat for `college-event-server-2` using the same settings.

Allow SSH only from your own current public IP; do not leave SSH open to `0.0.0.0/0`.

## 7. Install and start the application on each EC2 server

Perform this section on **both** servers. Substitute your GitHub repository address. These commands assume Ubuntu and an SSH key called `college-key.pem`:

```bash
ssh -i college-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
git clone https://github.com/YOUR_GITHUB_USERNAME/college-event-platform.git
cd college-event-platform
```

For a private GitHub repository, configure the deploy key/token first, then clone with the approved URL. Do not paste a long-lived GitHub token into shell history or commit it to the repository.

Create the backend file on **Server 1**:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Set these values:

```env
PORT=5000
SERVER_NAME=Server 1
DATABASE_URL=postgresql://YOUR_RDS_USERNAME:YOUR_URL_ENCODED_RDS_PASSWORD@YOUR_RDS_ENDPOINT:5432/college_events
DATABASE_SSL=true
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=YOUR_BUCKET_NAME
CORS_ORIGIN=http://localhost:3000
```

On **Server 2**, use the exact same values except:

```env
SERVER_NAME=Server 2
```

URL-encode special password characters in `DATABASE_URL`. For example, `@` becomes `%40` and `#` becomes `%23`.

Create the frontend environment file on both instances. It must be blank after the equals sign so the browser calls `/api` on the same ALB hostname:

```bash
printf 'NEXT_PUBLIC_API_URL=\n' > frontend/.env.local
```

Run the provided setup script on both instances:

```bash
chmod +x scripts/setup-ec2.sh
./scripts/setup-ec2.sh
pm2 status
```

This installs Node.js, PM2, dependencies, builds Next.js, and starts both processes. Test locally on each instance:

```bash
curl http://localhost:5000/api/health
curl -I http://localhost:3000
```

## 8. Configure Nginx on both servers

Nginx exposes one web port (80): it sends page requests to Next.js (3000) and `/api/` requests to Express (5000).

On each EC2 server:

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

The final command must return JSON with `"status":"healthy"` and the relevant server name.

## 9. Create the Application Load Balancer and target group

1. Open **EC2** → **Target Groups** → **Create target group**.
2. Select **Instances**, protocol **HTTP**, port **80**, and the same VPC.
3. Name it `college-event-targets`.
4. In health-check settings, set path to `/api/health`; use success code `200`.
5. Register both EC2 instances and create the target group.
6. Open **Load Balancers** → **Create Application Load Balancer**.
7. Make it **internet-facing**, choose two Availability Zones/subnets, and attach `college-alb-sg`.
8. Create an HTTP listener on port 80 that forwards to `college-event-targets`.
9. Wait until both targets show **Healthy**.
10. Open the ALB DNS name in the browser.

An ALB uses HTTP GET health checks against the configured path and port; review the [official target-group health-check documentation](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html) if a target does not become healthy.

## 10. Verify the full deployment

1. Open the ALB DNS name. The application must load through the ALB, not an EC2 public IP.
2. Check the header: **Running on: Server 1** or **Server 2**.
3. Refresh several times. With ALB stickiness disabled, requests can show either server.
4. Submit a registration without a file. Confirm a success ID appears.
5. Upload a small document. Confirm `registrations/REG-.../` appears in S3.
6. On Server 1, verify RDS data:

   ```bash
   PGPASSWORD='YOUR_RDS_PASSWORD' psql -h YOUR_RDS_ENDPOINT -U YOUR_RDS_USERNAME -d college_events \
     -c 'SELECT registration_id, full_name, created_at FROM registrations ORDER BY created_at DESC;'
   ```

7. On the target group, stop one API process to demonstrate failure:

   ```bash
   pm2 stop college-event-api
   ```

   Wait until the target becomes unhealthy, refresh the ALB URL, and show the app continues through the remaining healthy server. Restore it afterward:

   ```bash
   pm2 start college-event-api
   ```

## Updating the application later

Deploy one server at a time to keep the demo available:

```bash
cd ~/college-event-platform
git pull origin main
npm --prefix backend install
npm --prefix frontend install
npm --prefix frontend run build
pm2 restart college-event-api
pm2 restart college-event-frontend
```

Wait for the instance to return **Healthy** in the target group before updating the second server. If code changes affect environment variables, update `backend/.env` manually on each server; it is deliberately ignored by Git.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| ALB target unhealthy | Run `curl http://localhost/api/health`; check `pm2 logs`, `sudo nginx -t`, Nginx status, port-80 EC2 security group, and target port 80. |
| Page loads but API fails | Ensure `NEXT_PUBLIC_API_URL=` was blank **before** `npm run build`; rerun build and restart the frontend. |
| `database: unavailable` | Check RDS availability/endpoint/credentials, `DATABASE_SSL=true`, and port 5432 from `college-ec2-sg` to `college-rds-sg`. |
| S3 upload fails | Verify EC2 has the IAM role, bucket/region are correct, and the role policy’s bucket ARN includes `/registrations/*`. |
| Server badge always shows one server | Verify both targets are healthy; disable target-group stickiness for the clearest workshop demonstration. |

## Security and workshop scope

This is an instructional deployment. Keep RDS private, retain S3 public-access blocking, use an EC2 IAM role instead of static AWS keys, restrict SSH to your IP, and do not commit `.env` files. Before production use, add HTTPS with ACM, authentication, authorization, presigned/private S3 object access, backups, monitoring, rate limiting, and stronger validation.
