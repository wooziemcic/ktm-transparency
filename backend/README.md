# Kathmandu Transparency API (POC)

This is a minimal FastAPI backend for the Kathmandu Transparency App.

## Quick Start

### 1) Start Postgres (with PostGIS)
- Install Docker Desktop.
- In this folder, run:
```bash
docker compose up -d
```
This starts Postgres on `localhost:5432` with db `ktm_transparency`, user `postgres`, password `postgres`.

### 2) Create tables
If you already have `kathmandu_transparency_schema.sql` from earlier, run it once:
```bash
psql -h localhost -U postgres -d ktm_transparency -f kathmandu_transparency_schema.sql
```
(Windows: use the Postgres installation's `psql.exe`)

> Alternatively, `Base.metadata.create_all()` in `ingest_projects.py` will create the necessary tables if missing.

### 3) Python env and deps
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

### 4) Put your CSV next to the ingest script
Copy `kathmandu_valley_projects.csv` into this folder and run:
```bash
python -m app.ingest_projects
```

### 5) Run the API
```bash
uvicorn app.app:app --reload
```
By default CORS allows `http://localhost:19006` (Expo) and `http://localhost:5173` (Vite).

### 6) Test
- Health: http://127.0.0.1:8000/health
- Projects: http://127.0.0.1:8000/projects?district=Kathmandu
- Create a report (POST `/reports`) with JSON like:
```json
{
  "project_id": null,
  "status_flag": "stalled",
  "rating": 2,
  "text": "Road still dug up",
  "lat": 27.7172,
  "lng": 85.3240,
  "district": "Kathmandu",
  "ward": "16",
  "reporter_hash": "devicehash123"
}
```

## Notes
- This is a POC. Add auth, rate limiting, and media storage before production.
- UUIDs are generated server-side. District/ward mapping can be refined later.
