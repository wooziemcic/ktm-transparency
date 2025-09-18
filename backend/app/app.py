import uuid
from sqlalchemy import distinct
from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, func
from sqlalchemy import distinct
from datetime import datetime
from sqlalchemy import extract
import os

from .db import get_db
from . import models, schemas

app = FastAPI(title="Kathmandu Transparency API", version="0.1.0")

origins = os.getenv("CORS_ORIGINS", "http://localhost:19006").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/districts")
def list_districts(db: Session = Depends(get_db)):
    rows = db.execute(select(distinct(models.Project.district))).all()
    return sorted([r[0] for r in rows if r[0]])

@app.get("/agencies")
def list_agencies(district: str | None = None, db: Session = Depends(get_db)):
    stmt = select(models.Agency)
    if district:
        stmt = stmt.join(models.Project, models.Project.agency_id == models.Agency.id).where(
            func.lower(models.Project.district) == func.lower(district)
        ).group_by(models.Agency.id)
    rows = db.execute(stmt).scalars().all()
    return [{"id": a.id, "name": a.name} for a in rows]


@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/projects", response_model=list[schemas.ProjectOut])
def list_projects(
    q: str | None = Query(None, description="Search text"),
    district: str | None = Query(None),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    stmt = select(models.Project).join(models.Agency, isouter=True)
    if district:
        stmt = stmt.where(func.lower(models.Project.district) == func.lower(district))
    if q:
        ilike = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(models.Project.title).like(ilike),
                              func.lower(models.Agency.name).like(ilike)))
    stmt = stmt.order_by(models.Project.tender_date.desc().nullslast()).offset(offset).limit(limit)
    return db.execute(stmt).scalars().all()


@app.get("/projects/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    row = db.get(models.Project, project_id)
    if not row:
        return {"detail": "Not found"}
    return row

@app.get("/reports")
def list_reports(
    district: str | None = Query(None),
    project_id: str | None = Query(None),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    stmt = select(models.Report).order_by(models.Report.created_at.desc())
    if district:
        stmt = stmt.where(func.lower(models.Report.district) == func.lower(district))
    if project_id:
        stmt = stmt.where(models.Report.project_id == project_id)
    rows = db.execute(stmt.offset(offset).limit(limit)).scalars().all()
    # return light-weight dicts (Pydantic model is optional for this list)
    return [
        {
            "id": str(r.id),
            "project_id": str(r.project_id) if r.project_id else None,
            "created_at": r.created_at,
            "status_flag": r.status_flag,
            "rating": r.rating,
            "text": r.text,
            "lat": r.lat,
            "lng": r.lng,
            "ward": r.ward,
            "district": r.district,
        }
        for r in rows
    ]

@app.get("/stats/summary")
def summary_stats(district: str | None = None, db: Session = Depends(get_db)):
    # projects count
    stmt_proj = select(func.count(models.Project.id))
    if district:
        stmt_proj = stmt_proj.where(func.lower(models.Project.district) == func.lower(district))
    projects_count = db.execute(stmt_proj).scalar() or 0

    # reports count
    stmt_rep = select(func.count(models.Report.id))
    if district:
        stmt_rep = stmt_rep.where(func.lower(models.Report.district) == func.lower(district))
    reports_count = db.execute(stmt_rep).scalar() or 0

    # status breakdown
    stmt_breakdown = select(models.Report.status_flag, func.count()).group_by(models.Report.status_flag)
    if district:
        stmt_breakdown = stmt_breakdown.where(func.lower(models.Report.district) == func.lower(district))
    breakdown = {k or "unknown": v for k, v in db.execute(stmt_breakdown).all()}

    return {
        "district": district or "ALL",
        "projects": projects_count,
        "reports": reports_count,
        "status_breakdown": breakdown,
    }

@app.get("/stats/sector")
def sector_breakdown(district: str | None = None, db: Session = Depends(get_db)):
    stmt = select(models.Project.sector, func.count()).group_by(models.Project.sector)
    if district:
        stmt = stmt.where(func.lower(models.Project.district) == func.lower(district))
    rows = db.execute(stmt).all()
    # filter None and sort desc
    data = [{"sector": (k or "Other/Uncategorized"), "count": int(v)} for k, v in rows]
    data.sort(key=lambda x: x["count"], reverse=True)
    return data

@app.get("/stats/timeline")
def timeline_monthly(district: str | None = None, db: Session = Depends(get_db)):
    # group by year-month of tender_date
    stmt = select(
        extract("year", models.Project.tender_date).label("y"),
        extract("month", models.Project.tender_date).label("m"),
        func.count().label("c")
    ).where(models.Project.tender_date.isnot(None)).group_by("y","m").order_by("y","m")
    if district:
        stmt = stmt.where(func.lower(models.Project.district) == func.lower(district))
    out = []
    for y, m, c in db.execute(stmt):
        out.append({"year": int(y), "month": int(m), "count": int(c)})
    return out

@app.post("/reports", response_model=schemas.ReportOut)
def create_report(payload: schemas.ReportIn, db: Session = Depends(get_db)):
    report = models.Report(
        id=uuid.uuid4(),
        project_id=payload.project_id,
        created_at=datetime.utcnow(),
        status_flag=payload.status_flag,
        rating=payload.rating,
        text=payload.text,
        photo_urls=payload.photo_urls,
        lat=payload.lat,
        lng=payload.lng,
        ward=payload.ward,
        district=payload.district,
        channel=payload.channel,
        reporter_hash=payload.reporter_hash,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
