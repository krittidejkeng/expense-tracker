from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import pandas as pd
import os, time

app = FastAPI()

BASE_DIR     = os.path.dirname(__file__)
DATA_DIR     = os.path.join(BASE_DIR, 'data')
EXPENSES_CSV = os.path.join(DATA_DIR, 'expenses.csv')
GROUPS_CSV   = os.path.join(DATA_DIR, 'groups.csv')
EXP_COLS     = ['id', 'desc', 'amount', 'cat', 'group', 'date']
GRP_COLS     = ['name']

os.makedirs(DATA_DIR, exist_ok=True)


def load_exp() -> pd.DataFrame:
    if not os.path.exists(EXPENSES_CSV):
        return pd.DataFrame(columns=EXP_COLS)
    df = pd.read_csv(EXPENSES_CSV, dtype=str)
    df['amount'] = df['amount'].astype(float)
    df['group']  = df['group'].fillna('')
    return df

def save_exp(df: pd.DataFrame) -> None:
    df.to_csv(EXPENSES_CSV, index=False)

def load_grp() -> pd.DataFrame:
    if not os.path.exists(GROUPS_CSV):
        return pd.DataFrame(columns=GRP_COLS)
    return pd.read_csv(GROUPS_CSV, dtype=str)

def save_grp(df: pd.DataFrame) -> None:
    df.to_csv(GROUPS_CSV, index=False)


class ExpenseIn(BaseModel):
    desc:   str
    amount: float
    cat:    str
    group:  str = ''
    date:   str

class GroupIn(BaseModel):
    name: str


@app.get('/')
def index():
    return FileResponse(os.path.join(BASE_DIR, 'index.html'))


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

@app.delete('/api/groups/{name}')
def del_group(name: str):
    df = load_exp()
    df.loc[df['group'] == name, 'group'] = ''
    save_exp(df)
    df = load_grp()
    save_grp(df[df['name'] != name].reset_index(drop=True))
    return {'ok': True}
