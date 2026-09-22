#!/usr/bin/env python3
"""
Prarambh deployment + environment diagnostic.

- Compares .env.local / .env.example against every key the backend reads.
- Probes the live Vercel deployment: /api/time, /api/health and one real
  /api/admin/login attempt (credentials come from .env.local, never printed).

Usage:  python scripts/diagnose.py
"""

import json
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://prarambh-devnest.vercel.app"

# Every environment variable the backend reads, and where.
REQUIRED = {
    "TURSO_DATABASE_URL": "server/db.ts - Turso connection (libsql://...)",
    "TURSO_AUTH_TOKEN": "server/db.ts - Turso auth token",
    "SESSION_SECRET": "server/auth.ts - signs session cookies (HS256)",
    "CRON_SECRET": "server/routes/cron.ts - protects /api/cron/*",
    "ADMIN_EMAIL": "scripts/db-seed.ts - seeds the admin account",
    "ADMIN_PASSWORD": "scripts/db-seed.ts - seeds the admin account",
    "BLOB_READ_WRITE_TOKEN": "@vercel/blob - exam snapshots / result export",
}

PLACEHOLDERS = ("", "change-me", "your-", "change-me-to")


def parse_env(path: Path) -> dict:
    """Returns {KEY: value} for a .env style file (values never printed)."""
    values = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def looks_placeholder(value: str) -> bool:
    return not value or any(value.startswith(p) for p in PLACEHOLDERS if p)


def report_env() -> None:
    local = parse_env(ROOT / ".env.local")
    example = parse_env(ROOT / ".env.example")

    print("=" * 78)
    print("1) ENVIRONMENT KEYS")
    print("=" * 78)
    print(f"{'key':<24}{'in .env.local':<16}{'in .env.example':<18}used by")
    print("-" * 78)
    problems = []
    for key, used_by in REQUIRED.items():
        in_local = key in local
        in_example = key in example
        state = "yes" if in_local else "**MISSING**"
        if in_local and looks_placeholder(local[key]):
            state = "yes (placeholder-looking!)"
            problems.append(key)
        elif not in_local:
            problems.append(key)
        print(f"{key:<24}{state:<16}{'yes' if in_example else '-':<18}{used_by}")

    extra = sorted(set(local) - set(REQUIRED))
    if extra:
        print(f"\nextra keys in .env.local (not read by the backend): {', '.join(extra)}")

    print()
    if problems:
        print(f"-> PROBLEM KEYS: {', '.join(problems)}")
    else:
        print("-> all required keys are present in .env.local")
    print(
        "\nNOTE: .env.local is only read locally (npm dev / vercel dev). The values\n"
        "must ALSO exist in Vercel -> Project -> Settings -> Environment Variables\n"
        "(Production). /api/health below reports which ones the deployment sees."
    )


def fetch(path: str, method: str = "GET", body: dict | None = None) -> tuple[int, str]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"content-type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")
    except Exception as error:  # noqa: BLE001 - diagnostics only
        return -1, f"{type(error).__name__}: {error}"


def report_live() -> None:
    print()
    print("=" * 78)
    print("2) LIVE DEPLOYMENT (https://prarambh-devnest.vercel.app)")
    print("=" * 78)

    for path in ("/api/time", "/api/health"):
        status, body = fetch(path)
        print(f"\nGET {path} -> {status}")
        print("   " + body.replace("\n", " ")[:400])

    local = parse_env(ROOT / ".env.local")
    email = local.get("ADMIN_EMAIL", "")
    password = local.get("ADMIN_PASSWORD", "")
    if not email or not password:
        print("\nSKIP /api/admin/login: ADMIN_EMAIL / ADMIN_PASSWORD missing in .env.local")
        return

    # One attempt only: failures count towards the 5-per-15-minutes rate limit.
    status, body = fetch("/api/admin/login", method="POST", body={"email": email, "password": password})
    print(f"\nPOST /api/admin/login (credentials from .env.local) -> {status}")
    print("   " + body.replace("\n", " ")[:400])
    if status == 200:
        print("-> LOGIN WORKS in production: the account, password hash and DB are fine.")
    elif status == 401:
        print(
            "-> 401: production reached the DB and bcrypt says this password does not match\n"
            "   the stored hash (or the admin row/email differs). Re-seed the admin\n"
            "   (npm run db:seed) or reset the password hash in the admins table."
        )
    elif status == 429:
        print("-> 429: the login rate limiter already saw 5 failures for this IP+email.")
    elif status == 500:
        print("-> 500: unexpected server error - see the deployment runtime logs.")


if __name__ == "__main__":
    report_env()
    report_live()
