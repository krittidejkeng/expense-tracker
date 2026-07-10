# Deploy to PythonAnywhere (free public website)

Result: your Money Tracker at **https://YOURNAME.pythonanywhere.com** with a password lock.
Your CSV data files live on PythonAnywhere's disk and survive restarts.

> Note: the `data/` folder is NOT on GitHub (gitignored), so the website starts
> empty. Your local data stays on your Mac. If you want to copy it to the
> website, upload the CSV files in step 7.

---

## 1. Create a free account

1. Go to https://www.pythonanywhere.com → **Pricing & signup** → **Create a Beginner account** (free)
2. Choose your username carefully — it becomes your URL: `USERNAME.pythonanywhere.com`

## 2. Get the code onto PythonAnywhere

1. On PythonAnywhere, open **Consoles** → **Bash**
2. Run:
   ```bash
   git clone https://github.com/krittidejkeng/expense-tracker.git
   ```

## 3. Install the packages (small ones only — pandas is pre-installed)

In the same Bash console:

```bash
mkvirtualenv money --python=python3.10 --system-site-packages
pip install fastapi a2wsgi
```

(`--system-site-packages` reuses PythonAnywhere's pre-installed pandas, so you
don't blow the free 512 MB disk quota.)

## 4. Create the web app

1. Go to the **Web** tab → **Add a new web app**
2. Click through: your domain name → **Manual configuration** (NOT Flask/Django) → **Python 3.10**

## 5. Configure it (still on the Web tab)

- **Source code:** `/home/USERNAME/expense-tracker`
- **Virtualenv:** `/home/USERNAME/.virtualenvs/money`
- **WSGI configuration file:** click the link to edit it, DELETE everything, and paste:

  ```python
  import os, sys

  path = '/home/USERNAME/expense-tracker'
  if path not in sys.path:
      sys.path.insert(0, path)

  os.environ['MONEY_PASSWORD'] = 'CHOOSE-A-STRONG-PASSWORD'

  from wsgi import application
  ```

  Replace `USERNAME` (2 places) and the password. Save.

## 6. Launch

Back on the **Web** tab, click the green **Reload** button.
Open `https://USERNAME.pythonanywhere.com` — the browser asks for a login:

- **Username:** anything (it's ignored)
- **Password:** the one you set in step 5

## 7. (Optional) Copy your existing data from the Mac

1. On PythonAnywhere: **Files** tab → go into `expense-tracker` → create a `data` directory
2. Upload `expenses.csv`, `groups.csv`, `budgets.csv`, `fixed_costs.csv`, `settings.json`
   from `/Users/krittidejkeng/Keng/expense-tracker/data/` on your Mac
3. Web tab → Reload

## Keeping it alive (important!)

Free apps pause after 3 months. Once every ~3 months:
log into PythonAnywhere → **Web** tab → click **"Run until 3 months from today"**.
Set a phone reminder.

## Updating the website after code changes

In a PythonAnywhere Bash console:

```bash
cd ~/expense-tracker && git pull
```

Then **Web** tab → **Reload**.
