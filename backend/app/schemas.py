from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class AgencyOut(BaseModel):
    id: int
    name: str
    district: Optional[str] = None
    class Config:
        from_attributes = True

class ProjectOut(BaseModel):
    id: UUID
    ocid: Optional[str] = None
    title: str
    sector: Optional[str] = None
    district: Optional[str] = None
    planned_budget_amount: Optional[float] = None
    planned_budget_currency: Optional[str] = None
    award_start: Optional[datetime] = None
    award_end: Optional[datetime] = None
    tender_date: Optional[datetime] = None
    agency: Optional[AgencyOut] = None
    class Config:
        from_attributes = True

class ReportIn(BaseModel):
    project_id: Optional[UUID] = None
    status_flag: Optional[str] = None
    rating: Optional[int] = None
    text: Optional[str] = None
    photo_urls: Optional[List[str]] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    ward: Optional[str] = None
    district: Optional[str] = None
    channel: Optional[str] = "app"
    reporter_hash: Optional[str] = None

class ReportOut(BaseModel):
    id: UUID
    project_id: Optional[UUID] = None
    created_at: datetime
    status_flag: Optional[str]
    rating: Optional[int]
    text: Optional[str]
    photo_urls: Optional[List[str]]
    lat: Optional[float]
    lng: Optional[float]
    ward: Optional[str]
    district: Optional[str]
    class Config:
        from_attributes = True
