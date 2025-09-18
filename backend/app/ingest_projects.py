import uuid
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime
from .db import SessionLocal, engine, Base
from . import models

# Ensure tables exist if you already ran schema via SQL file, this is harmless
Base.metadata.create_all(bind=engine)

CSV_PATH = "data/kathmandu_valley_projects.csv"

def get_or_create_agency(db: Session, name: str):
    stmt = select(models.Agency).where(models.Agency.name == name)
    row = db.execute(stmt).scalar_one_or_none()
    if row:
        return row
    row = models.Agency(name=name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

def main():
    df = pd.read_csv(CSV_PATH)
    # Normalize dates
    for col in ["award_start", "award_end", "tender_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.tz_localize(None)

    with SessionLocal() as db:
        for _, r in df.iterrows():
            agency_name = (r.get("agency") or "").strip()
            if not agency_name:
                agency_name = "Unknown Agency"
            agency = get_or_create_agency(db, agency_name)

            proj = models.Project(
                id=uuid.uuid4(),
                ocid=str(r.get("ocid") or ""),
                title=str(r.get("title") or ""),
                agency_id=agency.id,
                sector=str(r.get("sector") or ""),
                district=str(r.get("district") or ""),
                ward=None,
                planned_budget_amount=(float(r.get("planned_budget_amount")) if pd.notna(r.get("planned_budget_amount")) else None),
                planned_budget_currency=str(r.get("planned_budget_currency") or ""),
                award_start=r.get("award_start") if pd.notna(r.get("award_start")) else None,
                award_end=r.get("award_end") if pd.notna(r.get("award_end")) else None,
                tender_date=r.get("tender_date") if pd.notna(r.get("tender_date")) else None,
                source_ref=str(r.get("source_ref") or ""),
            )
            db.add(proj)
        db.commit()
    print("Ingest complete.")

if __name__ == "__main__":
    main()
