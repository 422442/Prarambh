# Admin Setup via Turso Web Dashboard

## Step-by-Step Guide to Add Admin User via Web Browser

### 1. Go to Turso Dashboard

Visit: **https://turso.tech/app**

Login with your Turso account.

### 2. Find Your Database

- Look for the database: **`prarambh-db`** (or similar name)
- Click on it to open the database details

### 3. Open the SQL Console

- Look for a **"SQL Console"** or **"Query"** tab/button
- This will open a web-based SQL editor

### 4. Run This SQL Statement

Copy and paste this entire SQL statement into the console:

```sql
INSERT INTO admins (id, email, password_hash, created_at)
VALUES (
  'admin-1790007694803',
  'devnest.techclub@gmail.com',
  '$2b$10$Wue8cXXn3Tgyxq8Gch1iNO96rt1C70FqwXmnD1HBA3FUatH0.4vsS',
  1790007694
);
```

### 5. Execute the Query

- Click **"Run"** or **"Execute"** button
- You should see a success message like "1 row inserted"

### 6. Verify It Worked

Run this query to check:

```sql
SELECT id, email, created_at FROM admins;
```

You should see:

```
id                  | email                         | created_at
--------------------|-------------------------------|------------
admin-1790007694803 | devnest.techclub@gmail.com    | 1790007694
```

### 7. Try Logging In

Go to: **https://prarambh.devnest-two.vercel.app/admin/login**

Login with:

- **Email**: `devnest.techclub@gmail.com`
- **Password**: `CTOPrarambh2026`

## If You Get "Already Exists" Error

If the admin already exists, you need to update the password instead:

```sql
UPDATE admins
SET password_hash = '$2b$10$Wue8cXXn3Tgyxq8Gch1iNO96rt1C70FqwXmnD1HBA3FUatH0.4vsS'
WHERE email = 'devnest.techclub@gmail.com';
```

## Alternative: Turso Web Shell

If Turso doesn't have a SQL Console in the UI, they might have a web-based shell:

1. Go to: **https://turso.tech/app**
2. Find your database
3. Look for **"Shell"** or **"Console"** button
4. Run the INSERT statement above

## Screenshots Reference

The Turso dashboard typically looks like:

- Left sidebar: List of databases
- Main area: Database details, tabs, and actions
- SQL console/shell: Usually under "Query" or "Console" tab

## Troubleshooting

### Can't Find SQL Console?

Try these alternatives:

1. Look for "Query Editor", "SQL Editor", "Console", or "Shell" tabs
2. Check the database settings/actions menu for SQL options
3. Use the Turso CLI (see ADMIN_SETUP.md)

### Query Failed?

**Error: "table admins has no column named..."**

- The database might not be migrated. Run migrations first:
  ```bash
  npm run db:migrate
  ```

**Error: "UNIQUE constraint failed"**

- Admin already exists. Use the UPDATE query instead (see above)

**Error: "no such table: admins"**

- Database not initialized. Run migrations:
  ```bash
  npm run db:migrate
  ```

## Success!

Once the query succeeds, you can immediately login to the admin portal. No need to restart or redeploy anything.
