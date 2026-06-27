# Money Tracker — User Guide

A personal web app to track income, expenses, groups, and budgets.

---

## Starting the app

Open a terminal and run:

```bash
cd /Users/krittidejkeng/Keng/expense-tracker
venv/bin/uvicorn main:app --reload
```

Then open your browser and go to:

```
http://localhost:8000
```

Keep the terminal open while using the app. To stop it, press `Ctrl + C`.

> **If you see "Address already in use":**
> ```bash
> lsof -ti :8000 | xargs kill -9
> ```
> Then run the start command again.

---

## Features

### 1. Metrics (top of page)

Four summary numbers always visible:

| Metric | What it shows |
|---|---|
| **Total in** | All income ever recorded |
| **Total out** | All expenses ever recorded |
| **Balance** | Total in − Total out |
| **This month net** | Income − expenses for the current month only |

---

### 2. Groups

Groups are tags you attach to transactions (e.g. Travel, Self-improvement, Fixed costs).

- **Add a group:** type a name → click **Add group**
- **Delete a group:** click the × on the pill — transactions tagged with it become untagged
- You can filter the transaction list and charts by group

---

### 3. Add transaction

1. Toggle **Expense** or **Income** at the top of the form
2. Fill in: description, amount, category, group (optional), date
3. Click **Add expense** / **Add income**

**Expense categories:** Food & drinks, Transport, Shopping, Bills & utilities, Health, Entertainment, Other

**Income categories:** Salary, Freelance, Business, Investment, Gift, Other

---

### 4. Transactions list

Shows all transactions, newest first.

- **Filter** by type (expense/income), group, or category using the dropdowns
- **Delete** a transaction with the trash icon

---

### 5. Budgets

Set a spending goal for a category or group over a date range.

**How to create a budget:**
1. Enter a budget name (e.g. "July Food")
2. Enter the total amount (e.g. 6000)
3. Choose a category filter (or leave as "All expenses")
4. Choose a group filter (optional)
5. Set start and end dates (defaults to today → today + 29 days)
6. Click **Set budget**

**What the budget card shows:**

| Label | Meaning |
|---|---|
| **Spent ฿X of ฿Y** | How much spent so far vs total budget |
| **base plan: ฿Z/day** | What you'd spend per day if spread evenly (total ÷ days) |
| **Progress bar** | Green = on track · Orange = over pace · Red = over total budget |
| **Day X/Y** | Which day of the budget period you're on |
| **Today's budget: ฿Z** | How much you can spend today (adjusted for carry-over) |

**Carry-over logic:**
- If you spent **less** than planned on previous days → today's budget goes **up** (bonus carry-over)
- If you spent **more** than planned on previous days → today's budget goes **down** (penalty carry-over)

**Example:**
> Budget ฿6,000 over 20 days = ฿300/day base plan
> - Day 1: spent ฿100 → ฿200 under plan
> - Day 2: spent ฿350 → ฿50 under plan (cumulative)
> - Day 3: spent ฿500 → ฿50 **over** plan (cumulative: ฿950 vs ฿900 expected)
> - Day 4 budget: ฿300 − ฿50 penalty = **฿250 today**

**Tip:** Set the start date to today if you want to start tracking fresh without carry-over from past days.

---

### 6. Charts

**Income vs expenses over time** — line or bar chart showing money flow by date.

- Switch between **Line** and **Bar** view
- Change the time grouping:
  - **Daily** — one point per day
  - **Weekly** — one point per week (starts Monday)
  - **Monthly** — one point per month
  - **Yearly** — one point per year

**Expenses by category** — horizontal bar chart of expense totals per category

**Income by category** — horizontal bar chart of income totals per category

**By group** — horizontal bar chart of totals per group

---

## Data storage

All data is saved automatically to CSV files in the `data/` folder:

- `data/expenses.csv` — all transactions
- `data/groups.csv` — group names
- `data/budgets.csv` — budgets

You can open these files in Excel or Python/pandas. They are **not** pushed to GitHub (gitignored), so your personal data stays on your machine.
