# First AWS Deployment: One EC2 Server + Private RDS PostgreSQL

This beginner-friendly guide deploys this project for the first time. The website runs on one public EC2 server; its data lives in a separate, **private** Amazon RDS PostgreSQL database.

```text
Browser -> EC2 public IPv4 / Elastic IP -> Nginx -> Next.js + Express -> private RDS PostgreSQL
```

This is a good learning/test setup, but not highly available: if the EC2 instance stops, the site stops. Complete this guide before moving to the two-server/ALB design.

## Before you begin

You need an AWS account, a private GitHub repository containing this project, a computer with SSH (PowerShell works on Windows), and one AWS Region. Examples use Mumbai, `ap-south-1`; choose one Region and use it for all AWS resources.

Create a billing/budget alert before starting. EC2 and RDS can create charges while running, even when idle. AWS notes that a running EC2 instance is billable. See the [EC2 launch guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-launch-instance-wizard.html).

| Item | Example |
| --- | --- |
| EC2 security group | `college-one-ec2-sg` |
| RDS security group | `college-one-rds-sg` |
| EC2 instance | `college-event-server-1` |
| RDS instance identifier | `college-event-db` |
| Application database | `college_events` |
| Linux login user | `ubuntu` |

### Security rules to keep throughout

- Never commit `backend/.env`, `frontend/.env.local`, a `.pem` key, RDS password, GitHub token, or AWS access keys.
- Keep RDS private: never make it publicly accessible or allow port 5432 from `0.0.0.0/0`.
- Allow SSH only from **My IP**, never `0.0.0.0/0`.
- Save the RDS password in a password manager. AWS cannot show a self-managed master password again after creation; it would need to be reset. See [RDS database creation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateDBInstance.html).

## 1. Create the security groups

1. Sign in to AWS and select your Region in the upper-right corner.
2. Open **EC2** -> **Security Groups** -> **Create security group**.
3. Create `college-one-ec2-sg` in your default/project VPC with these inbound rules:

   | Type | Port | Source | Purpose |
   | --- | --- | --- | --- |
   | SSH | 22 | **My IP** | Secure server administration |
   | HTTP | 80 | `0.0.0.0/0` | Public website traffic |

   Keep the default outbound rule enabled.

4. Create `college-one-rds-sg` in the **same VPC**. Add one inbound rule:

   | Type | Port | Source |
   | --- | --- | --- |
   | PostgreSQL | 5432 | Select security group `college-one-ec2-sg` |

Choose the EC2 *security group* as the source, not its public IP address. Only servers assigned that group can reach PostgreSQL.

## 2. Create the EC2 application server

Create EC2 first so it can be selected while configuring RDS networking.

1. Open **EC2** -> **Instances** -> **Launch instances**.
2. Name it `college-event-server-1`.
3. Choose **Ubuntu Server 22.04 LTS** or newer Ubuntu LTS.
4. Choose a small general-purpose instance suitable for your account and budget. Check current price/Free Tier eligibility in your Region.
5. Under **Key pair (login)**, choose **Create new key pair**:
   - Name: `college-event-key`
   - Type: RSA; format: `.pem` for OpenSSH/PowerShell.
   - Download it and save it outside this repository. AWS provides it only once.
6. Under **Network settings**, click **Edit** and select your default/project VPC, a public subnet with public IPv4 enabled, and existing security group `college-one-ec2-sg`.
7. Launch the instance. Wait for `Running` and `2/2 checks passed`, then copy its **Public IPv4 address**.

AWS documents the console steps in its [instance launch wizard guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-launch-instance-wizard.html).

## 3. Create the private RDS PostgreSQL database

1. Open **RDS** -> **Databases** -> **Create database**.
2. Select **Standard create**, then **PostgreSQL**.
3. Choose **Dev/Test** for a learning deployment. For production, use production settings and review high availability, backup, and cost choices.
4. Under **Settings**, enter:
   - **DB instance identifier:** `college-event-db`
   - **Master username:** for example `appadmin`
   - A strong password (save it securely).
   - **Initial database name:** `college_events`, if that field is available.
5. Select a DB instance class/storage size suitable for learning and your budget.
6. Under **Connectivity**, choose the same VPC used by EC2. Set:
   - **Public access:** `No`
   - **VPC security group:** existing `college-one-rds-sg`
   - PostgreSQL port: `5432`
7. Create the database and wait for **Status: Available**.
8. In **Connectivity & security**, copy the **Endpoint**. It resembles:

   ```text
   college-event-db.abc123xyz.ap-south-1.rds.amazonaws.com
   ```

Copy only the hostname—no `https://`, port, or database name. RDS requires VPC/subnet networking that covers at least two Availability Zones; the console can configure this. AWS recommends keeping the database private for EC2-to-RDS deployments. See [RDS networking guidance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateDBInstance.html).

## 4. Connect to EC2

Open PowerShell in the folder containing your downloaded key, then replace the placeholder:

```powershell
ssh -i .\college-event-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

Type `yes` when asked to trust the host. A successful connection shows an `ubuntu@...` prompt.

If it times out, confirm the instance is running, its address is current, and the SSH security-group source is your current IP. Home/office IP addresses can change.

## 5. Clone your private GitHub repository securely

Use a GitHub **deploy key**. It is an SSH key restricted to this server and repository. Make it read-only; the server only needs to pull code. Do not copy your personal laptop GitHub key to EC2. GitHub describes this model in [Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

Run these commands **on EC2**:

```bash
sudo apt-get update
sudo apt-get install -y git
ssh-keygen -t ed25519 -C "college-event-ec2-readonly" -f ~/.ssh/college_event_deploy_key
cat ~/.ssh/college_event_deploy_key.pub
```

At the passphrase prompts, press Enter twice. Copy the full single public-key line beginning with `ssh-ed25519`.

In GitHub, open the private repository -> **Settings** -> **Deploy keys** -> **Add deploy key**. Title it `college-event-ec2`, paste the public key, leave **Allow write access** unchecked, and add it.

Back on EC2, configure Git to use the deploy key:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/college_event_deploy_key
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com
```

GitHub should confirm authentication but say it does not provide shell access. Clone using the SSH URL from GitHub's **Code** button:

```bash
git clone git@github.com:YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git college-event-platform
cd ~/college-event-platform
```

Do not clone with your GitHub account password; GitHub does not support password authentication for Git operations. A fine-grained personal access token is an alternative, but do not put a token in a command because shell history may expose it. A read-only deploy key is preferable here.

## 6. Add the RDS application configuration

From `~/college-event-platform`:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Set the file to match your database. Do not use `localhost`: PostgreSQL is on RDS.

```env
PORT=5000
SERVER_NAME=Server 1
DATABASE_URL=postgresql://YOUR_RDS_USERNAME:YOUR_URL_ENCODED_RDS_PASSWORD@YOUR_RDS_ENDPOINT:5432/college_events
DATABASE_SSL=true
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=
CORS_ORIGIN=http://localhost:3000
```

For a password `Pass@123`, use `Pass%40123` in the URL:

```env
DATABASE_URL=postgresql://appadmin:Pass%40123@college-event-db.abc123xyz.ap-south-1.rds.amazonaws.com:5432/college_events
```

URL-encode special password characters: `@` -> `%40`, `#` -> `%23`, `/` -> `%2F`, `:` -> `%3A`, `%` -> `%25`. Keep `DATABASE_SSL=true` for RDS.

Leave S3 blank for now; registrations work without file uploads. Create the frontend file with a blank API URL so Nginx will proxy browser requests to `/api`:

```bash
printf 'NEXT_PUBLIC_API_URL=\n' > frontend/.env.local
```

## 7. Create the database tables

Install the PostgreSQL **client** (not a local database server):

```bash
sudo apt-get install -y postgresql-client
```

If you provided `college_events` as RDS's initial database name, load the schema:

```bash
psql -h YOUR_RDS_ENDPOINT -U YOUR_RDS_USERNAME -d college_events -W -f database/schema.sql
```

If you did not provide an initial database name, create it then load the schema:

```bash
psql -h YOUR_RDS_ENDPOINT -U YOUR_RDS_USERNAME -d postgres -W -c 'CREATE DATABASE college_events;'
psql -h YOUR_RDS_ENDPOINT -U YOUR_RDS_USERNAME -d college_events -W -f database/schema.sql
```

`-W` prompts for the password instead of saving it in shell history. If `CREATE DATABASE` says it already exists, continue. Verify the sample data:

```bash
psql -h YOUR_RDS_ENDPOINT -U YOUR_RDS_USERNAME -d college_events -W -c 'SELECT id, name FROM events;'
```

A timeout usually means EC2/RDS are not in the same VPC or `college-one-rds-sg` does not allow port 5432 from `college-one-ec2-sg`.

## 8. Build and start the application

The repository script installs Node.js 22, PM2, dependencies, builds the frontend, and starts the API and frontend:

```bash
chmod +x scripts/setup-ec2.sh
./scripts/setup-ec2.sh
pm2 status
```

Both `college-event-api` and `college-event-frontend` should show `online`.

The script runs `pm2 startup`, which normally prints one extra `sudo ...` command. Copy and run the exact command PM2 prints, then save the process list:

```bash
pm2 save
```

Test from inside EC2:

```bash
curl http://localhost:5000/api/health
```

The result should include `"status":"healthy"` and `"database":"connected"`. If the database is unavailable, check the endpoint, username, encoded password, RDS status, and security group before continuing.

## 9. Configure Nginx and test the website

Nginx receives public port-80 traffic, sends pages to Next.js (port 3000), and `/api/` to Express (port 5000):

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

The last command should return healthy JSON. Open:

```text
http://YOUR_EC2_PUBLIC_IP
```

Verify the page loads, says **Running on: Server 1**, reports **Database: connected**, and can create/find a registration.

## Optional: stable address, S3, and updates

### Elastic IP

An EC2 public IPv4 can change after stop/start. For a stable test URL, use **EC2** -> **Elastic IP addresses** -> **Allocate Elastic IP address**, then **Actions** -> **Associate Elastic IP address** with this instance. Use it for SSH and browser access. Release unused Elastic IPs to avoid charges.

### S3 document uploads

After registrations work, create a private S3 bucket in the same Region. Attach an EC2 IAM role allowing only `s3:PutObject` on `arn:aws:s3:::YOUR_BUCKET_NAME/registrations/*`. Set `AWS_S3_BUCKET_NAME=YOUR_BUCKET_NAME` in `backend/.env`, then run `pm2 restart college-event-api`. Use the EC2 IAM role; never store AWS access keys in `.env`.

### Update deployed code

Push changes from your computer, then on EC2 run:

```bash
cd ~/college-event-platform
git pull origin main
npm --prefix backend install
npm --prefix frontend install
npm --prefix frontend run build
pm2 restart college-event-api
pm2 restart college-event-frontend
```

Replace `main` if your branch uses another name. Environment files are not tracked by Git and remain on the server.

## Troubleshooting and cleanup

| Problem | Check |
| --- | --- |
| SSH timeout | Instance running, correct public/Elastic IP, port 22 source is your current IP. |
| `Permission denied (publickey)` | Deploy key belongs to this repository; use SSH clone URL; run `ssh -T git@github.com`. |
| RDS timeout | Same VPC, RDS Available, RDS SG source is EC2 SG, RDS public access is No. |
| `database: unavailable` | Endpoint/user/password encoding, `DATABASE_SSL=true`, database/schema created. |
| Page will not load | EC2 SG permits port 80; `sudo systemctl status nginx`. |
| Nginx 502 | `pm2 status`, `pm2 logs`, and `sudo nginx -t`; both Node processes must be online. |
| Page loads but API fails | Confirm `NEXT_PUBLIC_API_URL=` was blank before building; rebuild frontend and restart its PM2 process. |

When testing ends, terminate EC2, delete RDS (choose whether to keep a final snapshot), release any Elastic IP, remove the deploy key from GitHub, then delete unused security groups. This prevents avoidable charges and removes access that is no longer needed.

When this single-server setup works, continue with [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) to add a second server and an Application Load Balancer.
