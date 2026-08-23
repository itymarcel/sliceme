import asyncio
from collections import defaultdict, deque
import io
import json
import logging
import os
import re
import time
import zipfile
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .ai_prefill import generate_slicer_recommendation
from .engine import SliceJob, UploadedModel, build_3mf, default_config, slice_job
from .gcode_enhancements import ENHANCEMENTS, apply_enhancement
from .print_presets import list_print_presets, print_preset_config
from .printer_presets import list_printer_presets, printer_preset_config
from .project_3mf import import_orca_project


logger = logging.getLogger("standalone-slicer")
app = FastAPI(title="Standalone Slicer API", version="1.0.0")
slice_slots = asyncio.Semaphore(int(os.environ.get("SLICER_CONCURRENCY", "1")))
prefill_slots = asyncio.Semaphore(int(os.environ.get("OPENAI_PREFILL_CONCURRENCY", "2")))
prefill_rate_events: dict[str, deque[float]] = defaultdict(deque)
prefill_rate_lock = asyncio.Lock()

MAX_FILE_BYTES = int(os.environ.get("SLICER_MAX_FILE_BYTES", str(200 * 1024 * 1024)))
MAX_MODELS = int(os.environ.get("SLICER_MAX_MODELS", "12"))
MAX_GCODE_BYTES = int(os.environ.get("SLICER_MAX_GCODE_BYTES", str(100 * 1024 * 1024)))
ALLOWED_EXTENSIONS = {".stl", ".step", ".stp"}
PREFILL_RATE_LIMIT = int(os.environ.get("OPENAI_PREFILL_RATE_LIMIT", "10"))
PREFILL_RATE_WINDOW_SECONDS = int(os.environ.get("OPENAI_PREFILL_RATE_WINDOW_SECONDS", "600"))


class PrefillSettingsRequest(BaseModel):
    description: str = Field(min_length=1, max_length=2000)
    config: dict[str, dict[str, Any]]


async def _enforce_prefill_rate_limit(request: Request) -> None:
    if PREFILL_RATE_LIMIT <= 0:
        return
    client_id = request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")
    now = time.monotonic()
    cutoff = now - PREFILL_RATE_WINDOW_SECONDS
    async with prefill_rate_lock:
        events = prefill_rate_events[client_id]
        while events and events[0] <= cutoff:
            events.popleft()
        if len(events) >= PREFILL_RATE_LIMIT:
            retry_after = max(1, int(events[0] + PREFILL_RATE_WINDOW_SECONDS - now))
            raise HTTPException(
                status_code=429,
                detail="Too many AI prefill requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )
        events.append(now)


def _safe_download_name(raw_name: str) -> str:
    stem = Path(raw_name).stem or "slice"
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._") or "slice"
    return f"{stem}.gcode"


def _safe_project_name(raw_name: str) -> str:
    stem = Path(raw_name).stem or "sliceme-project"
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._") or "sliceme-project"
    return f"{stem}.3mf"


def _parse_manifest(raw_manifest: str, files: list[UploadFile]) -> SliceJob:
    if len(raw_manifest.encode("utf-8")) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Manifest is too large")
    try:
        manifest = json.loads(raw_manifest)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=422, detail=f"Invalid manifest JSON: {error.msg}") from error

    if not isinstance(manifest, dict):
        raise HTTPException(status_code=422, detail="Manifest must be a JSON object")
    model_meta = manifest.get("models")
    if not isinstance(model_meta, list) or len(model_meta) != len(files):
        raise HTTPException(status_code=422, detail="Manifest models must match uploaded models")
    if any(not isinstance(model, dict) for model in model_meta):
        raise HTTPException(status_code=422, detail="Every manifest model must be an object")
    if not files or len(files) > MAX_MODELS:
        raise HTTPException(status_code=422, detail=f"Upload between 1 and {MAX_MODELS} models")

    object_fields = ("config", "fileOverrides", "rangeOverrides", "transforms", "startPositions")
    if any(not isinstance(manifest.get(key, {}), dict) for key in object_fields):
        raise HTTPException(status_code=422, detail="Config, overrides, transforms, and positions must be objects")
    if not isinstance(manifest.get("customGcodeForZ", []), list):
        raise HTTPException(status_code=422, detail="customGcodeForZ must be an array")

    return SliceJob(
        models=[],
        config=manifest.get("config") or {},
        file_overrides=manifest.get("fileOverrides") or {},
        range_overrides=manifest.get("rangeOverrides") or {},
        transforms=manifest.get("transforms") or {},
        custom_gcode_for_z=manifest.get("customGcodeForZ") or [],
        start_positions=manifest.get("startPositions") or {},
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/default-config")
def get_default_config():
    return default_config()


@app.get("/api/printer-presets")
def get_printer_presets():
    return {"presets": list_printer_presets()}


@app.get("/api/printer-presets/{preset_id}")
def get_printer_preset(preset_id: str):
    try:
        return {"machine_config": printer_preset_config(preset_id)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/print-presets")
def get_print_presets():
    return {"presets": list_print_presets()}


@app.get("/api/print-presets/{preset_id}")
def get_print_preset(preset_id: str):
    try:
        return {"process_config": print_preset_config(preset_id)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/enhancements")
def get_enhancements():
    return {"operations": list(ENHANCEMENTS)}


@app.post("/api/prefill-settings")
async def prefill_settings(payload: PrefillSettingsRequest, request: Request):
    if not payload.description.strip():
        raise HTTPException(status_code=422, detail="Description is required")
    await _enforce_prefill_rate_limit(request)
    try:
        async with prefill_slots:
            return await generate_slicer_recommendation(payload.description, payload.config)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (ValueError, json.JSONDecodeError) as error:
        logger.warning("Invalid OpenAI slicer recommendation: %s", error)
        raise HTTPException(status_code=502, detail="OpenAI returned an invalid slicer recommendation") from error
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="OpenAI did not respond in time") from error
    except httpx.HTTPStatusError as error:
        logger.warning("OpenAI slicer recommendation failed with status %s", error.response.status_code)
        raise HTTPException(status_code=502, detail="OpenAI could not generate slicer settings") from error
    except httpx.RequestError as error:
        logger.warning("Could not reach OpenAI: %s", type(error).__name__)
        raise HTTPException(status_code=502, detail="OpenAI could not be reached") from error


@app.post("/api/enhance")
async def enhance_gcode(operation: str = Form(...), gcode: UploadFile = File(...)):
    if operation not in ENHANCEMENTS:
        raise HTTPException(status_code=422, detail=f"Unknown G-code enhancement: {operation}")
    data = await gcode.read(MAX_GCODE_BYTES + 1)
    if len(data) > MAX_GCODE_BYTES:
        raise HTTPException(status_code=413, detail="G-code is too large")
    try:
        source = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=422, detail="G-code must be UTF-8 text") from error
    try:
        enhanced = await asyncio.to_thread(apply_enhancement, source, operation)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return Response(
        content=enhanced.encode("utf-8"),
        media_type="text/x-gcode",
        headers={"Content-Disposition": f'attachment; filename="{_safe_download_name(gcode.filename or "slice.gcode")}"'},
    )


@app.post("/api/slice")
async def slice_models(
    manifest: str = Form(...),
    models: list[UploadFile] = File(...),
):
    job = _parse_manifest(manifest, models)
    manifest_data = json.loads(manifest)
    uploaded_models: list[UploadedModel] = []

    for metadata, upload in zip(manifest_data["models"], models):
        filename = upload.filename or metadata.get("name") or "model.stl"
        if Path(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=415, detail=f"Unsupported model format: {filename}")
        data = await upload.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail=f"Model is too large: {filename}")
        uploaded_models.append(
            UploadedModel(
                file_id=str(metadata.get("id") or ""),
                file_name=filename,
                data=data,
                modifier_for=str(metadata.get("modifierFor")) if metadata.get("modifierFor") else None,
            )
        )

    if any(not model.file_id for model in uploaded_models):
        raise HTTPException(status_code=422, detail="Every model needs a stable client ID")
    if len({model.file_id for model in uploaded_models}) != len(uploaded_models):
        raise HTTPException(status_code=422, detail="Model IDs must be unique")

    job.models = uploaded_models
    job.__post_init__()
    try:
        async with slice_slots:
            gcode = await asyncio.to_thread(slice_job, job)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("Slice failed")
        raise HTTPException(status_code=500, detail=str(error)) from error

    download_name = _safe_download_name(uploaded_models[0].file_name)
    return Response(
        content=gcode,
        media_type="text/x-gcode",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@app.post("/api/export-project")
async def export_project(
    manifest: str = Form(...),
    fileName: str = Form("sliceme-project"),
    models: list[UploadFile] = File(...),
):
    job = _parse_manifest(manifest, models)
    manifest_data = json.loads(manifest)
    uploaded: list[UploadedModel] = []
    for metadata, upload in zip(manifest_data["models"], models):
        filename = upload.filename or metadata.get("name") or "model.stl"
        if Path(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=415, detail=f"Unsupported model format: {filename}")
        data = await upload.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail=f"Model is too large: {filename}")
        uploaded.append(UploadedModel(
            str(metadata.get("id") or ""), filename, data,
            modifier_for=str(metadata.get("modifierFor")) if metadata.get("modifierFor") else None,
        ))
    if any(not model.file_id for model in uploaded):
        raise HTTPException(status_code=422, detail="Every model needs a stable client ID")
    if len({model.file_id for model in uploaded}) != len(uploaded):
        raise HTTPException(status_code=422, detail="Model IDs must be unique")
    job.models = uploaded
    job.__post_init__()
    try:
        project = await asyncio.to_thread(build_3mf, job)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return Response(project, media_type="model/3mf", headers={
        "Content-Disposition": f'attachment; filename="{_safe_project_name(fileName)}"',
    })


@app.post("/api/import-project")
async def import_project(project: UploadFile = File(...)):
    if Path(project.filename or "").suffix.lower() != ".3mf":
        raise HTTPException(status_code=415, detail="Import requires a .3mf project")
    data = await project.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="3MF project is too large")
    try:
        imported = await asyncio.to_thread(import_orca_project, data, default_config())
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    output = io.BytesIO()
    manifest_models = []
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as package:
        for index, model in enumerate(imported.models):
            path = f"models/{index}.stl"
            package.writestr(path, model.stl)
            manifest_models.append({
                "path": path,
                "name": model.name,
                "position": model.position,
                "overrides": model.overrides,
                "modifierForIndex": model.modifier_for_index,
            })
        package.writestr("manifest.json", json.dumps({"config": imported.config, "models": manifest_models, "warnings": imported.warnings}))
    return Response(output.getvalue(), media_type="application/zip")
