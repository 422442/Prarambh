# Admin Portal Setup Guide

## Issue: "Network error. Please check your connection."

This error occurs because the admin user doesn't exist in the **production Turso database** on Vercel.

## Solution: Seed the Production Database

### Option 1: Using Turso CLI (Recommended)

1. **Install Turso CLI** (if not already installed):

   ```bash
   # Windows (PowerShell as Administrator)
   iwr https://turso.tech/install.ps1 -useb | iex

   # macOS/Linux
   curl -sSfL https://get.tur.so/install.sh | bash
   ```

2. **Login to Turso**:

   ```bash
   turso auth login
   ```

3. **Connect to your database**:

   ```bash
   turso db shell prarambh-db
   ```

4. **Check if admin exists**:

   ```sql
   SELECT * FROM admins;
   ```

5. **If no admin exists, create one manually**:

   ```sql
   INSERT INTO admins (id, email, password_hash, created_at)
   VALUES (
     'admin-001',
     'devnest.techclub@gmail.com',
     '$2a$10$YourBcryptHashHere',
     1737475200
   );
   ```

   **Note**: You need to generate a bcrypt hash for the password. Use this Node.js script:

   ```javascript
   // generate-hash.js
   import bcrypt from "bcryptjs";
   const hash = await bcrypt.hash("CTOPrarambh2026", 10);
   console.log(hash);
   ```

   Run: `node --input-type=module generate-hash.js`

### Option 2: Run Seed Script with Production Database

1. **Temporarily use production database locally**:
   ```bash
   # PowerShell
   $env:TURSO_DATABASE_URL="libsql://prarambh-db-devnesttechclub.aws-ap-south-1.turso.io"
   $env:TURSO_AUTH_TOKEN="your-auth-token-from-env-local"
   $env:ADMIN_EMAIL="devnest.techclub@gmail.com"
   $env:ADMIN_PASSWORD="CTOPrarambh2026"
   npm run db:seed
   ```

### Option 3: Check Vercel Environment Variables

The production environment needs these variables set in Vercel:

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Ensure these are set:
   - `TURSO_DATABASE_URL` = `libsql://prarambh-db-devnesttechclub.aws-ap-south-1.turso.io`
   - `TURSO_AUTH_TOKEN` = (your token from `.env.local`)
   - `SESSION_SECRET` = `dev-secret-key-1234567890-abcdefghijklmnop-local-development-secret`
   - `CRON_SECRET` = `dev-cron-secret`

4. **Important**: The `ADMIN_EMAIL` and `ADMIN_PASSWORD` are only needed for seeding, not runtime.

## Admin Login Credentials

- **Email**: `devnest.techclub@gmail.com`
- **Password**: `CTOPrarambh2026`

## Verify Setup

1. After seeding, try logging in at: `https://your-domain.vercel.app/admin/login`
2. If you see "Incorrect email or password", the seed worked but credentials are wrong
3. If you see "Network error", the API route or database connection has issues

## Troubleshooting

### Check if database is accessible:

```bash
curl https://your-domain.vercel.app/api/time
```

Should return: `{"serverTime": "2026-09-21T..."}`

### Check Vercel logs:

1. Go to Vercel dashboard → Deployments
2. Click on the latest deployment
3. Click on **Functions** tab
4. Check logs for `/api/admin/login`

### Common Issues:

1. **ENOTFOUND error**: Database URL is incorrect or network can't reach Turso
2. **401 Unauthorized**: Admin user exists but password is wrong
3. **Network error in browser**: CORS issue or API route not deployed
4. **404 on /api/admin/login**: Deployment didn't include the API routes (rebuild and redeploy)

## Quick Fix: Use Local Database for Testing

If you want to test locally while debugging production:

1. Edit `.env.local`:

   ```
   TURSO_DATABASE_URL=file:local.db
   ```

2. Restart dev server:

   ```bash
   npm run dev
   ```

3. Login at `http://localhost:3000/admin/login`

This will use the local database which already has the admin user seeded.
