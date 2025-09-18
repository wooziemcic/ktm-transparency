import uuid
from sqlalchemy import Column, String, Text, Numeric, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, ARRAY, DOUBLE_PRECISION
from sqlalchemy.orm import relationship
from .db import Base

class Agency(Base):
    __tablename__ = "agencies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, nullable=False, index=True)
    contact = Column(Text)
    district = Column(Text)
    agency_type = Column(Text)
    projects = relationship("Project", back_populates="agency")

class Project(Base):
    __tablename__ = "projects"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ocid = Column(Text)
    title = Column(Text, nullable=False, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"))
    sector = Column(Text)
    district = Column(Text)
    ward = Column(Text)
    planned_budget_amount = Column(Numeric)
    planned_budget_currency = Column(Text)
    award_start = Column(DateTime)
    award_end = Column(DateTime)
    tender_date = Column(DateTime)
    source_ref = Column(Text)

    agency = relationship("Agency", back_populates="projects")
    reports = relationship("Report", back_populates="project")

class Report(Base):
    __tablename__ = "reports"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    created_at = Column(DateTime)
    reporter_hash = Column(Text)
    channel = Column(Text)
    status_flag = Column(Text)
    rating = Column(Integer)
    text = Column(Text)
    photo_urls = Column(ARRAY(Text))
    lat = Column(DOUBLE_PRECISION)
    lng = Column(DOUBLE_PRECISION)
    ward = Column(Text)
    district = Column(Text)

    project = relationship("Project", back_populates="reports")
