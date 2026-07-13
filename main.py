from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
import pandas as pd
import os, time, json, secrets

# Password protection: set the MONEY_PASSWORD env var to require a login
# (browser shows a username/password prompt; username can be anything).
# When MONEY_PASSWORD is unset — e.g. running locally — no login is required.
PASSWORD = os.environ.get('MONEY_PASSWORD', '')
security = HTTPBasic()

def check_auth(c: HTTPBasicCredentials = Depends(security)):
    if not secrets.compare_digest(c.password.encode(), PASSWORD.encode()):
        raise HTTPException(status_code=401, detail='Wrong password',
                            headers={'WWW-Authenticate': 'Basic'})

app = FastAPI(dependencies=[Depends(check_auth)] if PASSWORD else [])

BASE_DIR     = os.path.dirname(__file__)
DATA_DIR     = os.path.join(BASE_DIR, 'data')
EXPENSES_CSV = os.path.join(DATA_DIR, 'expenses.csv')
GROUPS_CSV   = os.path.join(DATA_DIR, 'groups.csv')
BUDGETS_CSV  = os.path.join(DATA_DIR, 'budgets.csv')
FC_CSV       = os.path.join(DATA_DIR, 'fixed_costs.csv')
EXP_COLS     = ['id', 'type', 'desc', 'amount', 'cat', 'group', 'date']
GRP_COLS     = ['name']
BUDGET_COLS  = ['id', 'name', 'amount', 'cat', 'group', 'start_date', 'end_date']
FC_COLS      = ['id', 'name', 'amount', 'cat', 'group', 'recurrence', 'due_day']
SETTINGS_JSON = os.path.join(DATA_DIR, 'settings.json')
DEFAULT_SETTINGS = {'cycle_start_day': 1}

os.makedirs(DATA_DIR, exist_ok=True)


def load_exp() -> pd.DataFrame:
    if not os.path.exists(EXPENSES_CSV):
        return pd.DataFrame(columns=EXP_COLS)
    df = pd.read_csv(EXPENSES_CSV, dtype=str)
    df['amount'] = df['amount'].astype(float)
    df['group']  = df['group'].fillna('')
    df['type']   = df['type'].fillna('expense') if 'type' in df.columns else 'expense'
    return df

def save_exp(df: pd.DataFrame) -> None:
    df.to_csv(EXPENSES_CSV, index=False)

def load_grp() -> pd.DataFrame:
    if not os.path.exists(GROUPS_CSV):
        return pd.DataFrame(columns=GRP_COLS)
    return pd.read_csv(GROUPS_CSV, dtype=str)

def save_grp(df: pd.DataFrame) -> None:
    df.to_csv(GROUPS_CSV, index=False)

def load_budgets() -> pd.DataFrame:
    if not os.path.exists(BUDGETS_CSV):
        return pd.DataFrame(columns=BUDGET_COLS)
    df = pd.read_csv(BUDGETS_CSV, dtype=str)
    df['amount'] = df['amount'].astype(float)
    df['cat']   = df['cat'].fillna('all')
    df['group'] = df['group'].fillna('')
    return df

def save_budgets(df: pd.DataFrame) -> None:
    df.to_csv(BUDGETS_CSV, index=False)

def load_fc() -> pd.DataFrame:
    if not os.path.exists(FC_CSV):
        return pd.DataFrame(columns=FC_COLS)
    df = pd.read_csv(FC_CSV, dtype=str)
    df['amount'] = df['amount'].astype(float)
    df['group']  = df['group'].fillna('')
    return df

def save_fc(df: pd.DataFrame) -> None:
    df.to_csv(FC_CSV, index=False)

def load_settings() -> dict:
    if not os.path.exists(SETTINGS_JSON):
        return dict(DEFAULT_SETTINGS)
    try:
        with open(SETTINGS_JSON) as f:
            return {**DEFAULT_SETTINGS, **json.load(f)}
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULT_SETTINGS)

def save_settings(s: dict) -> None:
    with open(SETTINGS_JSON, 'w') as f:
        json.dump(s, f)


class ExpenseIn(BaseModel):
    type:   str = 'expense'
    desc:   str
    amount: float
    cat:    str
    group:  str = ''
    date:   str

class GroupIn(BaseModel):
    name: str

class SettingsIn(BaseModel):
    cycle_start_day: int = 1

class BudgetIn(BaseModel):
    name:       str
    amount:     float
    cat:        str = 'all'
    group:      str = ''
    start_date: str
    end_date:   str

class FixedCostIn(BaseModel):
    name:       str
    amount:     float
    cat:        str
    group:      str = ''
    recurrence: str = 'monthly'   # 'monthly', 'yearly', or 'monthly_flex'
    due_day:    str = ''          # '15' for monthly, 'MM-DD' for yearly, '' for flexible


@app.get('/')
def index():
    return FileResponse(os.path.join(BASE_DIR, 'index.html'))


# Auth stubs for LOCAL dev only — the real multi-user auth lives in the
# Cloudflare Worker (cloudflare/src/index.js). Locally you are always "logged in"
# as a single user, so the frontend's login screen is bypassed.
@app.get('/api/me')
def me():
    return {'username': 'local'}

@app.post('/api/login')
def local_login():
    return {'username': 'local'}

@app.post('/api/signup', status_code=201)
def local_signup():
    return {'username': 'local'}

@app.post('/api/logout')
def local_logout():
    return {'ok': True}


@app.get('/api/expenses')
def get_expenses():
    df = load_exp()
    df = df.sort_values(['date', 'id'], ascending=False)
    return df.to_dict(orient='records')

@app.post('/api/expenses', status_code=201)
def add_expense(e: ExpenseIn):
    df  = load_exp()
    row = {
        'id':     str(int(time.time() * 1000)),
        'type':   e.type,
        'desc':   e.desc,
        'amount': e.amount,
        'cat':    e.cat,
        'group':  e.group,
        'date':   e.date,
    }
    df = pd.concat([pd.DataFrame([row]), df], ignore_index=True)
    save_exp(df)
    return row

@app.delete('/api/expenses/{eid}')
def del_expense(eid: str):
    df = load_exp()
    if not (df['id'] == eid).any():
        raise HTTPException(status_code=404, detail='Expense not found')
    save_exp(df[df['id'] != eid].reset_index(drop=True))
    return {'ok': True}


@app.get('/api/groups')
def get_groups():
    return load_grp()['name'].tolist()

@app.post('/api/groups', status_code=201)
def add_group(g: GroupIn):
    df = load_grp()
    if g.name in df['name'].values:
        raise HTTPException(status_code=409, detail='Group already exists')
    save_grp(pd.concat([df, pd.DataFrame([{'name': g.name}])], ignore_index=True))
    return {'name': g.name}

@app.put('/api/groups/{name}')
def rename_group(name: str, g: GroupIn):
    new = g.name.strip()
    grp = load_grp()
    if name not in grp['name'].values:
        raise HTTPException(status_code=404, detail='Group not found')
    if new and new != name:
        if new in grp['name'].values:
            raise HTTPException(status_code=409, detail='Group already exists')
        grp.loc[grp['name'] == name, 'name'] = new
        save_grp(grp)
        exp = load_exp();     exp.loc[exp['group'] == name, 'group'] = new;   save_exp(exp)
        bud = load_budgets(); bud.loc[bud['group'] == name, 'group'] = new;   save_budgets(bud)
        fc  = load_fc();      fc.loc[fc['group']  == name, 'group'] = new;    save_fc(fc)
    return {'name': new}

@app.delete('/api/groups/{name}')
def del_group(name: str):
    df = load_exp()
    df.loc[df['group'] == name, 'group'] = ''
    save_exp(df)
    df = load_grp()
    save_grp(df[df['name'] != name].reset_index(drop=True))
    return {'ok': True}


@app.get('/api/budgets')
def get_budgets():
    return load_budgets().to_dict(orient='records')

@app.post('/api/budgets', status_code=201)
def add_budget(b: BudgetIn):
    df  = load_budgets()
    row = {
        'id':         str(int(time.time() * 1000)),
        'name':       b.name,
        'amount':     b.amount,
        'cat':        b.cat,
        'group':      b.group,
        'start_date': b.start_date,
        'end_date':   b.end_date,
    }
    df = pd.concat([pd.DataFrame([row]), df], ignore_index=True)
    save_budgets(df)
    return row

@app.put('/api/budgets/{bid}')
def update_budget(bid: str, b: BudgetIn):
    df = load_budgets()
    if not (df['id'] == bid).any():
        raise HTTPException(status_code=404, detail='Budget not found')
    idx = df.index[df['id'] == bid][0]
    df.loc[idx, ['name', 'amount', 'cat', 'group', 'start_date', 'end_date']] = \
        [b.name, b.amount, b.cat, b.group, b.start_date, b.end_date]
    save_budgets(df)
    return {
        'id':         bid,
        'name':       b.name,
        'amount':     b.amount,
        'cat':        b.cat,
        'group':      b.group,
        'start_date': b.start_date,
        'end_date':   b.end_date,
    }

@app.delete('/api/budgets/{bid}')
def del_budget(bid: str):
    df = load_budgets()
    if not (df['id'] == bid).any():
        raise HTTPException(status_code=404, detail='Budget not found')
    save_budgets(df[df['id'] != bid].reset_index(drop=True))
    return {'ok': True}


@app.get('/api/fixed-costs')
def get_fc():
    return load_fc().to_dict(orient='records')

@app.post('/api/fixed-costs', status_code=201)
def add_fc(fc: FixedCostIn):
    df  = load_fc()
    row = {
        'id':         str(int(time.time() * 1000)),
        'name':       fc.name,
        'amount':     fc.amount,
        'cat':        fc.cat,
        'group':      fc.group,
        'recurrence': fc.recurrence,
        'due_day':    fc.due_day,
    }
    df = pd.concat([pd.DataFrame([row]), df], ignore_index=True)
    save_fc(df)
    return row

@app.delete('/api/fixed-costs/{fid}')
def del_fc(fid: str):
    df = load_fc()
    if not (df['id'] == fid).any():
        raise HTTPException(status_code=404, detail='Fixed cost not found')
    save_fc(df[df['id'] != fid].reset_index(drop=True))
    return {'ok': True}


@app.get('/api/export/{filename}')
def export_csv(filename: str):
    loaders = {
        'expenses.csv':    load_exp,
        'groups.csv':      load_grp,
        'budgets.csv':     load_budgets,
        'fixed_costs.csv': load_fc,
    }
    if filename not in loaders:
        raise HTTPException(status_code=404, detail='Unknown export')
    csv_text = loaders[filename]().to_csv(index=False)
    return Response(content=csv_text, media_type='text/csv',
                    headers={'Content-Disposition': f'attachment; filename="{filename}"'})


@app.get('/api/settings')
def get_settings():
    return load_settings()

@app.put('/api/settings')
def put_settings(s: SettingsIn):
    day = min(max(s.cycle_start_day, 1), 31)  # 29-31 fall back to each month's last day in the cycle math
    settings = {'cycle_start_day': day}
    save_settings(settings)
    return settings
