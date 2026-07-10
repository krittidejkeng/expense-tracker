# Deploy Money Tracker to Cloudflare (free, always on)

Result: **https://keng-money.YOURNAME.workers.dev** — password-locked, data in
Cloudflare's D1 database, works even when your Mac is off. Free tier limits
(100,000 requests/day) are thousands of times more than you need.

All commands run from this folder:

```bash
cd /Users/krittidejkeng/Keng/expense-tracker/cloudflare
```

## 1. Create a free Cloudflare account

Sign up at https://dash.cloudflare.com/sign-up (email + password, free plan).

## 2. Log in from the terminal

```bash
npx wrangler login
```

A browser tab opens → click **Allow**.

## 3. Create the database

```bash
npx wrangler d1 create money-tracker
```

The output shows a `database_id = "...."` line — copy that ID into
[wrangler.toml](wrangler.toml), replacing `REPLACE_AFTER_WRANGLER_D1_CREATE`.

## 4. Create the tables and load your data

```bash
python3 make_import.py    # regenerates import_data.sql from your latest local data
npx wrangler d1 execute money-tracker --remote --file=schema.sql
npx wrangler d1 execute money-tracker --remote --file=import_data.sql
```

## 5. Deploy the app

```bash
npx wrangler deploy
```

First deploy asks you to pick your `*.workers.dev` subdomain — choose wisely,
it's part of your URL.

## 6. Set your password

```bash
npx wrangler secret put MONEY_PASSWORD
```

Type a strong password when prompted. Until this is set, the site shows
"Server not configured" and nobody can use it.

## 7. Open your site

`https://keng-money.YOURNAME.workers.dev`
Login: any username + your password.

---

## Updating the app later (after code changes)

```bash
cd /Users/krittidejkeng/Keng/expense-tracker/cloudflare
npx wrangler deploy
```

## Local testing

```bash
npx wrangler d1 execute money-tracker --local --file=schema.sql
npx wrangler d1 execute money-tracker --local --file=import_data.sql
npx wrangler dev --local --port 8787
```

Password for local dev is in `.dev.vars` (gitignored).

## Backups

Use the **Backup — download CSV** card at the bottom of the web page to
download your data as CSV files anytime (opens in Excel / pandas).

## Custom domain (optional, later)

If you ever buy `keng-money.dev` (~฿300/yr via Cloudflare Registrar):
Dash → Workers & Pages → keng-money → Settings → Domains & Routes → add domain.
No code changes needed.
