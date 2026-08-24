#!/usr/bin/env python3
"""Collect public EBSi English mock-exam files into XUniverse cloud storage."""

from __future__ import annotations

import argparse
import html
import json
import mimetypes
import os
import re
import tempfile
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote, urlparse

from playwright.sync_api import APIRequestContext, Playwright, sync_playwright


BASE = "https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperList.ebs?targetCd={target}"
AJAX_URL = "https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperListAjax.ajax"
DOWNLOAD_PREFIX = "https://wdown.ebsi.co.kr/W61001/01exam"
GRADES = {1: "D100", 2: "D200", 3: "D300"}
DEFAULT_MONTHS = (3, 6, 9, 10)
FILE_KINDS = ("question", "answer", "script")
CALL_PATTERN = re.compile(r"goDownLoad(?P<kind>[PJHD])\(\s*(['\"])(?P<url>.*?)\2", re.I | re.S)
TITLE_PATTERN = re.compile(r'<div\s+class=["\']qus_tit["\']>(?P<title>.*?)</div>', re.I | re.S)
TAG_PATTERN = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class DownloadCandidate:
    file_type: str
    url: str
    priority: int
    source_kind: str


@dataclass
class TargetResult:
    grade: int
    year: int
    month: int
    status: str = "queued"
    title: str = ""
    organizer: str = "EBSi"
    discovered_files: int = 0
    uploaded_files: int = 0
    skipped_files: int = 0
    db_registered: bool = False
    storage_paths: dict[str, str] | None = None
    error: str | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def clean_text(value: Any, max_length: int = 1_000) -> str:
    return str(value or "").replace("\x00", "").strip()[:max_length]


def exam_id(grade: int, year: int, month: int) -> str:
    return f"exam_english_g{grade}_{year}_{month:02d}"


def target_id(grade: int, year: int, month: int) -> str:
    return f"g{grade}_{year}_{month:02d}"


def strip_html(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(TAG_PATTERN.sub(" ", value))).strip()


def organizer_from_title(title: str) -> str:
    mappings = (
        ("평가원", "한국교육과정평가원"),
        ("서울", "서울특별시교육청"),
        ("경기", "경기도교육청"),
        ("인천", "인천광역시교육청"),
        ("부산", "부산광역시교육청"),
        ("대전", "대전광역시교육청"),
        ("광주", "광주광역시교육청"),
        ("대구", "대구광역시교육청"),
        ("울산", "울산광역시교육청"),
        ("전북", "전북특별자치도교육청"),
    )
    return next((organizer for token, organizer in mappings if token in title), "EBSi")


def allowed_download_url(value: str) -> str | None:
    raw = html.unescape(value).replace("\\/", "/").strip()
    if not raw:
        return None
    url = raw if raw.startswith(("http://", "https://")) else f"{DOWNLOAD_PREFIX}{raw}"
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"wdown.ebsi.co.kr", "lwdw.ebsi.co.kr"}:
        return None
    return url


def discover_candidates(markup: str) -> tuple[str, list[DownloadCandidate]]:
    title_match = TITLE_PATTERN.search(markup)
    title = strip_html(title_match.group("title")) if title_match else ""
    candidates: list[DownloadCandidate] = []
    for match in CALL_PATTERN.finditer(markup):
        source_kind = match.group("kind").upper()
        url = allowed_download_url(match.group("url"))
        if not url:
            continue
        if source_kind == "P":
            file_type, priority = "question", 100
        elif source_kind == "D":
            file_type, priority = "script", 100
        elif source_kind == "H":
            file_type, priority = "answer", 100
        else:
            file_type, priority = "answer", 50
        candidates.append(DownloadCandidate(file_type, url, priority, source_kind))

    selected: dict[str, DownloadCandidate] = {}
    for candidate in candidates:
        current = selected.get(candidate.file_type)
        if current is None or candidate.priority > current.priority:
            selected[candidate.file_type] = candidate
    return title, [selected[file_type] for file_type in FILE_KINDS if file_type in selected]


def response_extension(url: str, content_type: str, body: bytes) -> str:
    if body.startswith(b"%PDF"):
        return ".pdf"
    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if body.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    suffix = Path(unquote(urlparse(url).path)).suffix.lower()
    if re.fullmatch(r"\.[a-z0-9]{2,5}", suffix):
        return suffix
    guessed = mimetypes.guess_extension(content_type.split(";", 1)[0].strip())
    return guessed or ".bin"


def valid_public_file(body: bytes, extension: str) -> bool:
    if len(body) < 1_024:
        return False
    if extension == ".pdf":
        return body.startswith(b"%PDF")
    if extension == ".png":
        return body.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in {".jpg", ".jpeg"}:
        return body.startswith(b"\xff\xd8\xff")
    return False


def firebase_cli_credentials():
    from google.oauth2.credentials import Credentials

    config_path = Path.home() / ".config" / "configstore" / "firebase-tools.json"
    if not config_path.exists():
        return None
    config = json.loads(config_path.read_text(encoding="utf-8"))
    tokens = config.get("tokens") or {}
    access_token = tokens.get("access_token")
    expires_at = float(tokens.get("expires_at") or 0) / 1_000
    if not access_token or expires_at <= time.time() + 60:
        return None
    return Credentials(token=access_token, scopes=["https://www.googleapis.com/auth/cloud-platform"])


def load_google_credentials():
    from google.auth import default
    from google.oauth2 import service_account

    raw = os.getenv("PROBLEM_BANK_SERVICE_ACCOUNT_JSON") or os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw and raw != "{}":
        return service_account.Credentials.from_service_account_info(
            json.loads(raw), scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_path:
        return service_account.Credentials.from_service_account_file(
            credentials_path, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
    cli_credentials = firebase_cli_credentials()
    if cli_credentials:
        return cli_credentials
    credentials, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return credentials


class CloudRepository:
    def __init__(self, project_id: str, bucket_name: str):
        from google.cloud import firestore, storage

        credentials = load_google_credentials()
        self.firestore_module = firestore
        self.db = firestore.Client(project=project_id, credentials=credentials)
        self.storage_client = storage.Client(project=project_id, credentials=credentials)
        self.bucket = self.storage_client.bucket(bucket_name)

    def exam_snapshot(self, grade: int, year: int, month: int):
        return self.db.collection("exams").document(exam_id(grade, year, month)).get()

    def blob_exists(self, path: str) -> bool:
        return self.bucket.blob(path).exists(client=self.storage_client)

    def upload_bytes(self, path: str, body: bytes, content_type: str, source_url: str) -> bool:
        from google.api_core.exceptions import PreconditionFailed

        blob = self.bucket.blob(path)
        blob.metadata = {"source": "EBSi official archive", "source_url": source_url}
        try:
            blob.upload_from_string(body, content_type=content_type, if_generation_match=0)
            return True
        except PreconditionFailed:
            return False

    def save_exam(self, result: TargetResult, source_urls: dict[str, str]) -> None:
        paths = result.storage_paths or {}
        ref = self.db.collection("exams").document(exam_id(result.grade, result.year, result.month))
        existing = ref.get().to_dict() or {}
        payload = {
            "id": ref.id,
            "year": result.year,
            "grade": result.grade,
            "month": result.month,
            "subject": "english",
            "organizer": result.organizer,
            "title": result.title,
            "question_file_path": paths.get("question") or existing.get("question_file_path"),
            "answer_file_path": paths.get("answer") or existing.get("answer_file_path"),
            "script_file_path": paths.get("script") or existing.get("script_file_path"),
            "source_urls": {**(existing.get("source_urls") or {}), **source_urls},
            "source_archive": BASE.format(target=GRADES[result.grade]),
            "parse_status": existing.get("parse_status") or "not_started",
            "collected_at": existing.get("collected_at") or self.firestore_module.SERVER_TIMESTAMP,
            "updated_at": self.firestore_module.SERVER_TIMESTAMP,
        }
        ref.set({key: value for key, value in payload.items() if value is not None}, merge=True)
        result.db_registered = True

    def create_direct_job(self, args) -> str:
        ref = self.db.collection("exam_collection_jobs").document()
        total = len(args.grades) * len(args.months) * (args.end_year - args.start_year + 1)
        ref.create({
            "id": ref.id,
            "status": "queued",
            "source": "ebsi-official-archive",
            "subject": "english",
            "grades": args.grades,
            "months": args.months,
            "start_year": args.start_year,
            "end_year": args.end_year,
            "total_targets": total,
            "completed_targets": 0,
            "failed_targets": 0,
            "uploaded_files": 0,
            "skipped_files": 0,
            "db_registered_count": 0,
            "requested_by_uid": "local-worker",
            "requested_by_email": "local-worker",
            "created_at": self.firestore_module.SERVER_TIMESTAMP,
            "updated_at": self.firestore_module.SERVER_TIMESTAMP,
        })
        return ref.id

    def next_queued_job(self) -> str | None:
        snapshots = list(
            self.db.collection("exam_collection_jobs").where("status", "==", "queued").limit(20).stream()
        )
        if not snapshots:
            return None
        snapshots.sort(key=lambda snap: (snap.to_dict() or {}).get("created_at") or utc_now())
        return snapshots[0].id

    def load_job(self, job_id: str) -> dict[str, Any]:
        snapshot = self.db.collection("exam_collection_jobs").document(job_id).get()
        if not snapshot.exists:
            raise RuntimeError(f"job-not-found:{job_id}")
        return snapshot.to_dict() or {}

    def mark_job_running(self, job_id: str) -> bool:
        transaction = self.db.transaction()
        ref = self.db.collection("exam_collection_jobs").document(job_id)

        @self.firestore_module.transactional
        def claim(txn):
            snapshot = ref.get(transaction=txn)
            data = snapshot.to_dict() or {}
            if data.get("status") not in {"queued", "running"}:
                return False
            txn.update(ref, {
                "status": "running",
                "started_at": data.get("started_at") or self.firestore_module.SERVER_TIMESTAMP,
                "updated_at": self.firestore_module.SERVER_TIMESTAMP,
                "error": self.firestore_module.DELETE_FIELD,
            })
            return True

        return bool(claim(transaction))

    def update_target(self, job_id: str, result: TargetResult) -> None:
        target_ref = self.db.collection("exam_collection_jobs").document(job_id).collection("targets").document(
            target_id(result.grade, result.year, result.month)
        )
        target_ref.set({
            **asdict(result),
            "storage_paths": result.storage_paths or {},
            "updated_at": self.firestore_module.SERVER_TIMESTAMP,
        }, merge=True)

    def set_target_running(self, job_id: str, grade: int, year: int, month: int) -> None:
        target_ref = self.db.collection("exam_collection_jobs").document(job_id).collection("targets").document(
            target_id(grade, year, month)
        )
        target_ref.set({
            "grade": grade,
            "year": year,
            "month": month,
            "status": "running",
            "updated_at": self.firestore_module.SERVER_TIMESTAMP,
        }, merge=True)
        self.db.collection("exam_collection_jobs").document(job_id).update({
            "current_target": target_id(grade, year, month),
            "updated_at": self.firestore_module.SERVER_TIMESTAMP,
        })

    def increment_job(self, job_id: str, result: TargetResult) -> None:
        increments = {
            "completed_targets": self.firestore_module.Increment(1 if result.status == "completed" else 0),
            "failed_targets": self.firestore_module.Increment(1 if result.status == "failed" else 0),
            "uploaded_files": self.firestore_module.Increment(result.uploaded_files),
            "skipped_files": self.firestore_module.Increment(result.skipped_files),
            "db_registered_count": self.firestore_module.Increment(1 if result.db_registered else 0),
            "updated_at": self.firestore_module.SERVER_TIMESTAMP,
        }
        self.db.collection("exam_collection_jobs").document(job_id).update(increments)

    def finish_job(self, job_id: str) -> None:
        ref = self.db.collection("exam_collection_jobs").document(job_id)
        data = ref.get().to_dict() or {}
        failed = int(data.get("failed_targets") or 0)
        ref.update({
            "status": "completed_with_errors" if failed else "completed",
            "current_target": self.firestore_module.DELETE_FIELD,
            "completed_at": self.firestore_module.SERVER_TIMESTAMP,
            "updated_at": self.firestore_module.SERVER_TIMESTAMP,
        })

    def fail_job(self, job_id: str, error: Exception) -> None:
        self.db.collection("exam_collection_jobs").document(job_id).update({
            "status": "failed",
            "error": clean_text(error, 500),
            "completed_at": self.firestore_module.SERVER_TIMESTAMP,
            "updated_at": self.firestore_module.SERVER_TIMESTAMP,
        })


class EbsiCollector:
    def __init__(self, request: APIRequestContext, repository: CloudRepository | None, bucket_prefix: str, dry_run: bool):
        self.request = request
        self.repository = repository
        self.bucket_prefix = bucket_prefix.strip("/")
        self.dry_run = dry_run

    def archive_markup(self, grade: int, year: int, month: int) -> str:
        target = GRADES[grade]
        self.request.get(BASE.format(target=target), timeout=60_000)
        response = self.request.post(
            AJAX_URL,
            form={
                "targetCd": target,
                "yearList": str(year),
                "monthList": f"{month:02d}",
                "arOrd": "3",
                "subjIdList": "17014",
                "sort": "recent",
            },
            timeout=60_000,
        )
        if not response.ok:
            raise RuntimeError(f"ebsi-archive-http-{response.status}")
        return response.text()

    def download(self, candidate: DownloadCandidate) -> tuple[bytes, str, str]:
        response = self.request.get(candidate.url, timeout=60_000)
        if not response.ok:
            raise RuntimeError(f"download-http-{response.status}:{candidate.file_type}")
        body = response.body()
        content_type = clean_text(response.headers.get("content-type"), 120) or "application/octet-stream"
        extension = response_extension(candidate.url, content_type, body)
        if not valid_public_file(body, extension):
            raise RuntimeError(f"download-invalid-file:{candidate.file_type}:{extension}:{len(body)}")
        return body, content_type, extension

    def collect_target(self, grade: int, year: int, month: int) -> TargetResult:
        result = TargetResult(grade=grade, year=year, month=month, status="running", storage_paths={})
        try:
            markup = self.archive_markup(grade, year, month)
            title, candidates = discover_candidates(markup)
            result.title = title
            result.organizer = organizer_from_title(title)
            result.discovered_files = len(candidates)
            if not candidates:
                raise RuntimeError("no-public-english-files-found")
            existing = self.repository.exam_snapshot(grade, year, month).to_dict() if self.repository else {}
            existing = existing or {}
            source_urls: dict[str, str] = {}
            for candidate in candidates:
                field_name = f"{candidate.file_type}_file_path"
                existing_path = clean_text(existing.get(field_name), 1_000)
                if self.repository and existing_path and self.repository.blob_exists(existing_path):
                    result.storage_paths[candidate.file_type] = existing_path
                    result.skipped_files += 1
                    continue
                body, content_type, extension = self.download(candidate)
                storage_path = (
                    f"{self.bucket_prefix}/grade{grade}/{year}/{month:02d}/{candidate.file_type}{extension}"
                )
                source_urls[candidate.file_type] = candidate.url
                if self.repository and self.repository.blob_exists(storage_path):
                    result.storage_paths[candidate.file_type] = storage_path
                    result.skipped_files += 1
                    continue
                if self.repository and not self.dry_run:
                    if self.repository.upload_bytes(storage_path, body, content_type, candidate.url):
                        result.uploaded_files += 1
                    else:
                        result.skipped_files += 1
                result.storage_paths[candidate.file_type] = storage_path
            if self.repository and not self.dry_run:
                self.repository.save_exam(result, source_urls)
            result.status = "completed"
        except Exception as error:  # noqa: BLE001 - one failed target must not stop the whole job
            result.status = "failed"
            result.error = clean_text(error, 500)
        return result


def target_specs(job: dict[str, Any], max_targets: int | None = None) -> Iterable[tuple[int, int, int]]:
    count = 0
    for grade in sorted({int(value) for value in job.get("grades", []) if int(value) in GRADES}):
        for year in range(int(job["start_year"]), int(job["end_year"]) + 1):
            for month in sorted({int(value) for value in job.get("months", []) if int(value) in DEFAULT_MONTHS}):
                if max_targets is not None and count >= max_targets:
                    return
                count += 1
                yield grade, year, month


def process_job(repository: CloudRepository, collector: EbsiCollector, job_id: str, max_targets: int | None) -> list[TargetResult]:
    if not repository.mark_job_running(job_id):
        raise RuntimeError(f"job-not-runnable:{job_id}")
    job = repository.load_job(job_id)
    results: list[TargetResult] = []
    try:
        for grade, year, month in target_specs(job, max_targets):
            print(f"[collect] job={job_id} grade={grade} year={year} month={month:02d}", flush=True)
            repository.set_target_running(job_id, grade, year, month)
            result = collector.collect_target(grade, year, month)
            repository.update_target(job_id, result)
            repository.increment_job(job_id, result)
            results.append(result)
            print(
                f"  {result.status}: discovered={result.discovered_files} uploaded={result.uploaded_files} "
                f"skipped={result.skipped_files} db={result.db_registered}",
                flush=True,
            )
            time.sleep(0.8)
        repository.finish_job(job_id)
        return results
    except Exception as error:
        repository.fail_job(job_id, error)
        raise


def parse_args():
    current_year = datetime.now().year
    parser = argparse.ArgumentParser(description="XUniverse EBSi English mock-exam ingestion worker")
    parser.add_argument("--start-year", type=int, default=current_year)
    parser.add_argument("--end-year", type=int, default=current_year)
    parser.add_argument("--grades", nargs="+", type=int, default=[1, 2, 3])
    parser.add_argument("--months", nargs="+", type=int, default=list(DEFAULT_MONTHS))
    parser.add_argument("--job-id")
    parser.add_argument("--from-queue", action="store_true")
    parser.add_argument("--create-job", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-targets", type=int)
    parser.add_argument("--project-id", default=os.getenv("PROBLEM_BANK_PROJECT_ID", "xstudy-problem-bank"))
    parser.add_argument(
        "--bucket", default=os.getenv("FIREBASE_STORAGE_BUCKET", "xtudynote.firebasestorage.app")
    )
    parser.add_argument("--storage-prefix", default="exam-files/english")
    args = parser.parse_args()
    args.grades = sorted(set(args.grades))
    args.months = sorted(set(args.months))
    if any(grade not in GRADES for grade in args.grades):
        parser.error("grades must be 1, 2, or 3")
    if any(month not in DEFAULT_MONTHS for month in args.months):
        parser.error("months must be 3, 6, 9, or 10")
    if args.start_year < 2006 or args.end_year > current_year or args.start_year > args.end_year:
        parser.error(f"year range must be 2006..{current_year}")
    if args.max_targets is not None and args.max_targets < 1:
        parser.error("max-targets must be positive")
    return args


def create_request_context(playwright: Playwright) -> APIRequestContext:
    return playwright.request.new_context(
        extra_http_headers={
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
            "User-Agent": "XUniverseExamCollector/1.0 (+official-public-archive-ingestion)",
        },
        timeout=60_000,
    )


def main() -> int:
    args = parse_args()
    repository = None if args.dry_run else CloudRepository(args.project_id, args.bucket)
    job_id = args.job_id
    if repository and args.create_job:
        job_id = repository.create_direct_job(args)
        print(f"[job] queued {job_id}", flush=True)
    if repository and args.from_queue and not job_id:
        job_id = repository.next_queued_job()
        if not job_id:
            print("[job] no queued collection job", flush=True)
            return 0

    with sync_playwright() as playwright:
        request = create_request_context(playwright)
        collector = EbsiCollector(request, repository, args.storage_prefix, args.dry_run)
        try:
            if job_id and repository:
                results = process_job(repository, collector, job_id, args.max_targets)
            else:
                direct_job = {
                    "grades": args.grades,
                    "months": args.months,
                    "start_year": args.start_year,
                    "end_year": args.end_year,
                }
                results = []
                for grade, year, month in target_specs(direct_job, args.max_targets):
                    print(f"[collect] grade={grade} year={year} month={month:02d}", flush=True)
                    result = collector.collect_target(grade, year, month)
                    results.append(result)
                    print(json.dumps(asdict(result), ensure_ascii=False), flush=True)
                    time.sleep(0.8)
        finally:
            request.dispose()

    failed = sum(1 for result in results if result.status == "failed")
    print(f"[done] targets={len(results)} failed={failed}", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
