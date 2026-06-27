# Money Tracker — Project Guide for Claude

## What is this?

A personal money tracker web app. The user logs income and expenses, organises them into groups/tags, views charts, and sets spending budgets with carry-over logic.

**Stack:** FastAPI backend (Python) · single-file HTML+JS frontend · CSV files for storage · no database.

---

## How to run

```bash
# From /Users/krittidejkeng/Keng/expense-tracker/
venv/bin/uvicorn main:app --reload
# Then open http://localhost:8000
```

**Important — virtual environment:** the venv was created with Homebrew Python (`/opt/homebrew/bin/python3.10`) to avoid an arm64/x86_64 architecture mismatch. Always use `venv/bin/uvicorn`, never the system uvicorn.

If port 8000 is busy: `lsof -ti :8000 | xargs kill -9`

---

## File structure

```
expense-tracker/
├── main.py          — FastAPI server + all API routes
├── index.html       — entire frontend (HTML + CSS + JS in one file)
├── requirements.txt — fastapi, uvicorn[standard], pandas
├── venv/            — Python virtualenv (gitignored)
└── data/            — CSV storage, auto-created, gitignored
    ├── expenses.csv
    ├── groups.csv
    └── budgets.csv
```

---

## Backend — main.py

### CSV schemas

| File | Columns |
|---|---|
| `expenses.csv` | `id, type, desc, amount, cat, group, date` |
| `groups.csv` | `name` |
| `budgets.csv` | `id, name, amount, cat, group, start_date, end_date` |

- `type` on expenses: `'expense'` or `'income'`
- `cat` on budgets: specific category name, or `'all'` to match all expenses
- `group` on budgets: group name to filter by, or `''` to match all groups
- All IDs are millisecond timestamps as strings: `str(int(time.time() * 1000))`
- Missing columns handled gracefully in `load_exp()` (backfills `type` as `'expense'`)

### API routes

```
GET    /                    → serves index.html
GET    /api/expenses        → list all, sorted by date desc
POST   /api/expenses        → add one (body: ExpenseIn)
DELETE /api/expenses/{id}   → delete one

GET    /api/groups          → list all group names
POST   /api/groups          → add one (body: GroupIn), 409 if duplicate
DELETE /api/groups/{name}   → delete group, clears group field on all its expenses

GET    /api/budgets         → list all
POST   /api/budgets         → add one (body: BudgetIn)
DELETE /api/budgets/{id}    → delete one
```

---

## Frontend — index.html

Single file. No framework, no build step. Loads at `http://localhost:8000`.

### External dependencies (CDN)
- **Chart.js 4.4.1** — loaded in `<head>` (important: must be in head, not body)
- **Tabler Icons webfont 3.31.0** — icon font via `<i class="ti ti-*">`

### Theme
Warm off-white light mode (`--surface-0: #f4f2eb`) / dark mode auto via `prefers-color-scheme`. CSS variables defined in `:root`. Key colours: `--green: #1D9E75`, `--red: #E24B4A`, `--accent: #378ADD`.

### Global state variables
```js
let transactions = [];   // all expenses/income from server
let groups       = [];   // group names from server
let budgets      = [];   // budgets from server
let currentType  = 'expense';  // active type toggle in add-transaction form
let chartType    = 'line';     // 'line' or 'bar' for timeline chart
let granularity  = 'daily';    // 'daily'|'weekly'|'monthly'|'yearly'
let timelineChart = null;      // Chart.js instance (destroyed/recreated on update)
```

### Category lists
```js
EXPENSE_CATS = ['Food & drinks','Transport','Shopping','Bills & utilities','Health','Entertainment','Other']
INCOME_CATS  = ['Salary','Freelance','Business','Investment','Gift','Other']
```
Each has matching `CAT_COLORS`, `CAT_BG`, `CAT_TEXT` objects for badge/bar colouring.

### Key functions

| Function | What it does |
|---|---|
| `api(path, method, body)` | Wrapper around `fetch()`, throws on non-ok |
| `fmt(n)` | Formats number as `฿1,234.50` (absolute value, no sign) |
| `setType(type)` | Switches income/expense toggle, updates category select |
| `addTransaction()` | POSTs to `/api/expenses`, prepends to `transactions[]`, calls `renderAll()` |
| `deleteTransaction(id)` | DELETEs, removes from array, calls `renderAll()` |
| `addGroup()` / `deleteGroup(name)` | Group CRUD |
| `addBudget()` / `deleteBudget(id)` | Budget CRUD |
| `renderAll()` | Calls all render functions in order |
| `renderMetrics()` | Updates 4 metric chips: Total In, Total Out, Balance, This Month Net |
| `renderGroups()` | Redraws group pills + syncs group selects (including budget form) |
| `renderList()` | Filtered transaction list (filter by type/group/cat) |
| `renderCharts()` | Bar charts for expense by category, income by category, by group |
| `renderTimelineChart()` | Chart.js income vs expense over time |
| `renderBudgets()` | Draws all budget cards with carry-over calculations |
| `calcBudget(b)` | Pure function — computes budget stats from `transactions[]` |
| `getGroupKey(dateStr)` | Groups a date string by the current `granularity` |
| `formatKey(key)` | Formats a grouped date key as "27 Jun 2026" |

### renderAll() call order
```js
renderMetrics() → renderGroups() → renderFilterCats() → renderList()
→ renderBudgets() → renderCharts() → renderTimelineChart()
```

### init()
Loads data in parallel, sets today's date on all date inputs, seeds budget date range to today → today+29 days.

---

## Budget carry-over logic (important)

The budget system uses **carry-over**: if you underspend previous days, that surplus is added to today's allowance; if you overspent, today's allowance is reduced.

### calcBudget(b) — key variables

```
totalDays        = (end - start) in days + 1  (inclusive)
dailyRate        = b.amount / totalDays        (base plan per day)
daysCompleted    = full days elapsed before today (0 on start day)
daysElapsed      = daysCompleted + 1 if active  (displayed as "Day X/Y")

spentBeforeToday = sum of matching transactions with date < today
expectedBeforeToday = daysCompleted * dailyRate

carryOver        = spentBeforeToday - expectedBeforeToday
                   positive → overspent previous days
                   negative → underspent (surplus)

todayBudget      = dailyRate - carryOver
                   if under: todayBudget > dailyRate  (bonus)
                   if over:  todayBudget < dailyRate  (penalty)

actualSpent      = ALL matching transactions in range (including today)
remaining        = b.amount - actualSpent
overBudget       = actualSpent > b.amount
overPace         = carryOver > 0.005
pct              = min(round(actualSpent / b.amount * 100), 100)
```

### Status messages shown
- Not started: `Starts in X days · Target: ฿Z/day`
- Active, on track: `Day X/Y · Today's budget: ฿Z (+฿W carry-over from unused days)`
- Active, over pace: `Day X/Y · Today's budget: ฿Z (−฿W carry-over from overspend)`
- Active, over total: `Day X/Y · Over total budget by ฿Z`
- Finished, ok: `Completed · Saved ฿Z`
- Finished, over: `Completed · Over budget by ฿Z`

### Budget matching rules
A transaction counts toward a budget if:
1. `type === 'expense'`
2. `date >= budget.start_date AND date <= budget.end_date`
3. If `budget.cat !== 'all'`: `transaction.cat === budget.cat`
4. If `budget.group !== ''`: `transaction.group === budget.group`

---

## Constraints and decisions

- **Never push to GitHub** unless the user explicitly says to push. Commit locally only.
- `data/` is gitignored — personal financial data never goes to git.
- No database: CSV keeps it simple and lets the user open files in Excel or pandas.
- `id` is a millisecond timestamp string — not a UUID, collision risk negligible for personal use.
- The frontend never uses localStorage — all state comes from the server on load.
- Chart.js must be in `<head>` (not body) and `renderTimelineChart()` must be in the same `<script>` block as the rest of the JS, or the chart won't render.
- `fmt()` always returns `฿X` with absolute value. Signs (+/−) are added manually in display strings.
- Date labels use `"27 Jun 2026"` format (day → month → year), not ISO or US format.
