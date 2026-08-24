# Workshop Demo Script

## Step 1 — Open the platform

Open the Application Load Balancer DNS name. Explain: “Students can browse College Tech Fest events and register online.” Point out the green **Running on** badge and the AWS Architecture Demo panel.

## Step 2 — Show the application tier

In the EC2 console, show the two instances. Explain: “The same simple Node/Next application runs on both instances. Their only difference is `SERVER_NAME`: Server 1 or Server 2.”

## Step 3 — Show target health

Open the ALB target group. Show both targets healthy. Explain that the health check is `GET /api/health`, which returns HTTP 200.

## Step 4 — Demonstrate load balancing

Refresh the browser a few times (or use a private/incognito window if ALB stickiness is enabled). The server badge/current request can alternate between Server 1 and Server 2. Explain: “The ALB chooses a healthy target for incoming requests.”

## Step 5 — Demonstrate shared RDS data

Submit a registration. Note the success registration ID and handling server. In the RDS query editor run:

```sql
SELECT registration_id, full_name, email, created_at FROM registrations ORDER BY created_at DESC;
```

Explain: “Both EC2 servers write to the same PostgreSQL database, so the data is not tied to one server.”

## Step 6 — Demonstrate S3 storage

Submit a registration with a small PDF. Open the S3 bucket and show `registrations/REG-.../`. Explain: “The database contains the key; the document itself is safely outside the EC2 instance.”

## Step 7 — Demonstrate high availability

Stop the API on Server 1: `pm2 stop college-event-api`. Wait for it to become unhealthy in the target group, then refresh the ALB URL. The application remains available via Server 2. Explain: “The ALB removes unhealthy targets and sends traffic to the remaining healthy server.” Restore it with `pm2 start college-event-api`.
