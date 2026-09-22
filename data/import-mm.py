#!/usr/bin/env python3
"""Convert a Money Manager SQLite backup to Vida's finance import payload."""
import argparse, json, re, sqlite3
from collections import defaultdict
from pathlib import Path

COLORS = ["#ec0000", "#3ecf8e", "#7c3aed", "#006fcf", "#f97316", "#820ad1", "#e6a23c", "#22d3ee", "#84cc16", "#a78bfa", "#64748b", "#14b8a6", "#3d9cf0", "#f07178"]

def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

def ident(prefix, value):
    safe = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return f"mm-{prefix}-{safe}"

def unique(items):
    out, seen = [], set()
    for item in items:
        item = clean(item)
        key = item.casefold()
        if item and key not in seen:
            out.append(item); seen.add(key)
    return out

def account_type(name, group_uid):
    n = name.casefold()
    if group_uid == "2" or any(x in n for x in ("like u", "amex", "tc hey", "tarjetas de crédito")):
        return "credito"
    if "nu" in n or "ahorro" in n or "tanda" in n:
        return "ahorros"
    if group_uid == "8": return "inversion"
    if group_uid == "11" and not any(x in n for x in ("deuda", "préstamo", "prestamo")):
        return "efectivo"
    if group_uid in ("1", "3"): return "debito"
    return "otro"

def institution(name):
    n = name.casefold()
    if "santander" in n or "like u" in n: return "Santander"
    if "amex" in n: return "Amex"
    if "hey banco" in n: return "Hey Banco"
    if re.search(r"\bnu\b", n): return "Nu"
    return None

def payment_method(acc_type, do_type):
    if do_type in ("3", "4"): return "Transferencia"
    return {"efectivo": "Efectivo", "credito": "Crédito", "debito": "Débito", "ahorros": "SPEI"}.get(acc_type, "Otro")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("output", type=Path)
    args = ap.parse_args()
    con = sqlite3.connect(args.source)
    con.row_factory = sqlite3.Row
    assets = list(con.execute("SELECT * FROM ZASSET ORDER BY Z_PK"))
    account_ids = {r["ZUID"]: ident("account", r["ZUID"]) for r in assets}
    accounts = []
    type_by_uid = {}
    for i, r in enumerate(assets):
        name = clean(r["ZNICNAME"]) or f"Cuenta {r['Z_PK']}"
        typ = account_type(name, clean(r["ZGROUPUID"]))
        type_by_uid[r["ZUID"]] = typ
        accounts.append({
            "id": account_ids[r["ZUID"]], "name": name, "type": typ,
            "color": COLORS[i % len(COLORS)], "icon": {"efectivo":"💵","debito":"🏦","credito":"💳","ahorros":"🐷","inversion":"📈","otro":"📁"}[typ],
            "openingBalance": 0, "institution": institution(name),
            "creditLimit": None, "cutoffDay": int(r["ZCARD_DAYFIN"]) if typ == "credito" and clean(r["ZCARD_DAYFIN"]).isdigit() else None,
            "paymentDueDay": int(r["ZCARD_DAYPAY"]) if typ == "credito" and clean(r["ZCARD_DAYPAY"]).isdigit() else None,
            "nextStatementDate": None, "nextPaymentDate": None,
            "_fromMM": True, "_mmUid": r["ZUID"], "_mmDeleted": bool(r["ZISDEL"] or 0)
        })
    transactions = []
    rows = list(con.execute("SELECT * FROM ZINOUTCOME ORDER BY ZDATE, Z_PK"))
    for r in rows:
        do_type = clean(r["ZDO_TYPE"])
        typ = "ingreso" if do_type in ("0", "4") else "gasto"
        is_transfer = do_type in ("3", "4")
        category = clean(r["ZCATEGORY_NAME"]) or ("Traspaso" if is_transfer else ("Otros ingresos" if typ == "ingreso" else "Otros gastos"))
        content, memo = clean(r["ZCONTENT"]), clean(r["ZMEMO"])
        note_bits = (["Traspaso"] if is_transfer else []) + [x for x in (content, memo) if x and x != "Traspaso"]
        note = " · ".join(unique(note_bits))
        asset_uid = r["ZASSETUID"]
        if asset_uid not in account_ids:
            raise RuntimeError(f"Transaction {r['Z_PK']} references unknown account {asset_uid}")
        transactions.append({
            "id": ident("tx", r["ZUID"] or r["Z_PK"]), "type": typ,
            "amount": round(abs(float(r["ZAMOUNT"] or 0)), 2), "category": category,
            "date": clean(r["ZTXDATESTR"]), "note": note,
            "accountId": account_ids[asset_uid], "paymentMethod": payment_method(type_by_uid[asset_uid], do_type),
            "_fromMM": True, "_mmPk": r["Z_PK"], "_mmUid": r["ZUID"], "_mmDoType": do_type,
            "_transferId": clean(r["ZTXUIDTRANS"]) or None
        })
    cats = list(con.execute("SELECT * FROM ZCATEGORY WHERE COALESCE(ZISDEL,0)=0 ORDER BY ZDOTYPE, ZORDER, Z_PK"))
    categories = {
        "ingreso": unique(["Otros ingresos", "Traspaso"] + [r["ZNAME"] for r in cats if int(r["ZDOTYPE"] or 0) == 0]),
        "gasto": unique(["Otros gastos", "Traspaso"] + [r["ZNAME"] for r in cats if int(r["ZDOTYPE"] or 0) == 1])
    }
    # MM's “Préstamos Andy” history: MX$15,000 lent, then MX$3,000 received, outstanding MX$12,000.
    andy_uid = next((r["ZUID"] for r in assets if clean(r["ZNICNAME"]).casefold() == "préstamos andy"), None)
    loans = []
    if andy_uid:
        loan_rows = [r for r in rows if r["ZASSETUID"] == andy_uid]
        lent = [r for r in loan_rows if clean(r["ZDO_TYPE"]) == "1" and clean(r["ZCONTENT"]).casefold() == "andy"]
        payments = [r for r in loan_rows if clean(r["ZDO_TYPE"]) == "3"]
        if lent:
            principal = round(sum(float(r["ZAMOUNT"] or 0) for r in lent), 2)
            loans.append({
                "id": "mm-loan-andy", "person": "Andy", "amount": principal,
                "date": clean(lent[0]["ZTXDATESTR"]), "note": "Importado de la cuenta Préstamos Andy",
                "payments": [{"id": ident("loan-payment", r["ZUID"] or r["Z_PK"]), "amount": round(float(r["ZAMOUNT"] or 0),2), "date": clean(r["ZTXDATESTR"]), "note": clean(r["ZCONTENT"]) or "Abono", "_fromMM": True} for r in payments],
                "accountId": account_ids[andy_uid], "_fromMM": True
            })
    payload = {"format":"vida-mm-import-v1", "source":"Money Manager", "accounts":accounts, "transactions":transactions, "categories":categories, "loans":loans}
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    balances = defaultdict(float)
    for t in transactions:
        balances[t["accountId"]] += t["amount"] if t["type"] == "ingreso" else -t["amount"]
    print(f"Accounts: {len(accounts)}")
    print(f"Transactions: {len(transactions)}")
    print(f"Categories: {len(categories['ingreso'])} ingreso, {len(categories['gasto'])} gasto")
    print(f"Loans: {len(loans)}")
    for a in accounts:
        print(f"  {a['name']}: {balances[a['id']]:,.2f}")

if __name__ == "__main__": main()
