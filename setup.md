# Local Setup Guide

This guide runs the College Event Registration Platform on a Windows computer with PostgreSQL.

## 1. Install prerequisites

Install the following software:

- Node.js 22 LTS or newer
- PostgreSQL 15 or newer, including the `psql` command-line tool
- Optional: AWS CLI, if you want to test document uploads to Amazon S3

Open PowerShell and confirm that the commands are available:

```powershell
node --version
npm --version
psql --version
```

## 2. Create the PostgreSQL database

Log in as the PostgreSQL administrator. Enter the password when prompted.

```powershell
psql -U postgres
```

Create the database, then leave the PostgreSQL prompt:

```sql
CREATE DATABASE college_events;
\q
```

From the project folder, create the application tables and insert the five sample events:

```powershell
cd D:\awsdemo
psql -U postgres -d college_events -f database\schema.sql
```

## 3. Configure the backend

Create the backend environment file:

```powershell
Copy-Item backend\.env.example backend\.env
```

Open `backend\.env` and update the database URL with your PostgreSQL password:

```env
PORT=5000
SERVER_NAME=Server 1
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/college_events
DATABASE_SSL=false
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=
CORS_ORIGIN=http://localhost:3000
```

Replace `YOUR_POSTGRES_PASSWORD`. If the password contains special URL characters, encode them. For example, `Pass@123` must be written as `Pass%40123`.

`AWS_S3_BUCKET_NAME` can remain empty when testing registrations without document uploads.

## 4. Configure the frontend

Create `frontend\.env.local` with the API address:

```powershell
@"
NEXT_PUBLIC_API_URL=http://localhost:5000
"@ | Set-Content frontend\.env.local
```

## 5. Install packages

From the project root, install backend and frontend packages:

```powershell
cd D:\awsdemo
npm run install:all
```

## 6. Start the backend

Open a PowerShell window and run:

```powershell
cd D:\awsdemo\backend
npm run dev
```

Expected output:

```text
College Event API running on port 5000 (Server 1)
```

In a separate PowerShell window, verify the API:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

Expected fields include `status: healthy`, `server: Server 1`, and `database: connected`.

## 7. Start the frontend

Open another PowerShell window and run:

```powershell
cd D:\awsdemo\frontend
npm run dev
```

Browse to <http://localhost:3000>. The header should show **Running on: Server 1**.

## 8. Test a registration

1. Choose an event and complete the required fields.
2. Leave the document field empty unless S3 is configured.
3. Select **Register Now**.
4. Confirm that the success panel displays a registration ID and Server 1.

Verify the saved record with:

```powershell
psql -U postgres -d college_events -c "SELECT registration_id, full_name, email, created_at FROM registrations ORDER BY created_at DESC;"
```

You can also use the **Find your registration** section in the web application. Search with the registration ID shown on the success message, your email address, or both.

## 9. Optional: test Amazon S3 uploads

1. Create an S3 bucket in your selected AWS Region.
2. Install/configure AWS CLI credentials with `aws configure`, or use an IAM role on EC2.
3. Set the actual bucket name and region in `backend\.env`:

   ```env
   AWS_REGION=ap-south-1
   AWS_S3_BUCKET_NAME=your-bucket-name
   ```

4. Restart the backend.
5. Submit a registration with a document (maximum size: 10 MB).
6. In S3, confirm the upload under `registrations/REG-.../`.

## Troubleshooting

| Problem | Resolution |
| --- | --- |
| `client password must be a string` | Set a valid password in `DATABASE_URL`; do not leave the password section empty. |
| `database: unavailable` | Confirm PostgreSQL is running, database is `college_events`, and host/port/password are correct. |
| Page says it cannot reach the API | Start the backend and ensure `NEXT_PUBLIC_API_URL=http://localhost:5000`. Restart Next.js after editing `.env.local`. |
| Document upload fails | Configure `AWS_REGION`, `AWS_S3_BUCKET_NAME`, and AWS permissions/credentials; restart the backend. |
