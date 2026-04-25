from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

try:
    from reconstruction.processor import process_ply_to_pointcloud
except ModuleNotFoundError:
    repo_root = Path(__file__).resolve().parents[4]
    if str(repo_root) not in sys.path:
        sys.path.append(str(repo_root))
    from reconstruction.processor import process_ply_to_pointcloud

router = APIRouter(prefix="/scans", tags=["scans"])

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
RAW_DIR = DATA_DIR / "uploads" / "raw"
PROCESSED_DIR = DATA_DIR / "uploads" / "processed"
JOBS_FILE = DATA_DIR / "uploads" / "jobs.json"
LATEST_FILE = DATA_DIR / "uploads" / "latest.json"

MAX_UPLOAD_BYTES = 250 * 1024 * 1024  # 250MB

for d in (RAW_DIR, PROCESSED_DIR):
    d.mkdir(parents=True, exist_ok=True)


def _read_jobs() -> dict[str, dict[str, Any]]:
    if not JOBS_FILE.exists():
        return {}
    try:
        return json.loads(JOBS_FILE.read_text())
    except json.JSONDecodeError:
        return {}


def _write_jobs(jobs: dict[str, dict[str, Any]]) -> None:
    JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
    JOBS_FILE.write_text(json.dumps(jobs, indent=2))


def _set_latest(scan_id: str) -> None:
    LATEST_FILE.write_text(json.dumps({"scan_id": scan_id}))


def _get_latest_id() -> str | None:
    if not LATEST_FILE.exists():
        return None
    try:
        payload = json.loads(LATEST_FILE.read_text())
        return payload.get("scan_id")
    except json.JSONDecodeError:
        return None


@router.post("/upload")
async def upload_scan(file: UploadFile = File(...)):
    filename = file.filename or ""
    if not filename.lower().endswith(".ply"):
        raise HTTPException(status_code=400, detail="Only .ply point cloud files are supported")

    scan_id = uuid4().hex
    raw_path = RAW_DIR / f"{scan_id}.ply"
    out_path = PROCESSED_DIR / f"{scan_id}.json"

    size = 0
    with raw_path.open("wb") as dst:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                dst.close()
                raw_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File too large. Max size is 250MB")
            dst.write(chunk)

    jobs = _read_jobs()
    jobs[scan_id] = {
        "scan_id": scan_id,
        "status": "processing",
        "filename": filename,
        "size_bytes": size,
    }
    _write_jobs(jobs)

    try:
        process_ply_to_pointcloud(raw_path, out_path)
        jobs[scan_id]["status"] = "done"
        jobs[scan_id]["pointcloud_path"] = str(out_path)
        _write_jobs(jobs)
        _set_latest(scan_id)
    except Exception as exc:  # noqa: BLE001
        jobs[scan_id]["status"] = "failed"
        jobs[scan_id]["error"] = str(exc)
        _write_jobs(jobs)
        raise HTTPException(status_code=400, detail=f"Failed to process PLY: {exc}") from exc

    return {
        "scan_id": scan_id,
        "status": "done",
        "filename": filename,
        "size_bytes": size,
    }


@router.get("/latest/status")
def latest_scan_status():
    latest_id = _get_latest_id()
    if not latest_id:
        raise HTTPException(status_code=404, detail="No scans uploaded yet")
    return scan_status(latest_id)


@router.get("/latest/pointcloud")
def latest_scan_pointcloud():
    latest_id = _get_latest_id()
    if not latest_id:
        raise HTTPException(status_code=404, detail="No scans uploaded yet")
    return scan_pointcloud(latest_id)


@router.get("/{scan_id}/status")
def scan_status(scan_id: str):
    jobs = _read_jobs()
    job = jobs.get(scan_id)
    if not job:
        raise HTTPException(status_code=404, detail="scan_id not found")
    return job


@router.get("/{scan_id}/pointcloud")
def scan_pointcloud(scan_id: str):
    jobs = _read_jobs()
    job = jobs.get(scan_id)
    if not job:
        raise HTTPException(status_code=404, detail="scan_id not found")
    if job.get("status") != "done":
        return {"scan_id": scan_id, "status": job.get("status")}

    path = PROCESSED_DIR / f"{scan_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Processed point cloud not found")

    return json.loads(path.read_text())
