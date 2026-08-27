#!/usr/bin/env python3
"""Public, permission-aware textbook ingestion worker for Xstudy Problem Bank."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


ROOT = Path(__file__).resolve().parent
DEFAULT_CATALOG = ROOT / "catalog.json"
DEFAULT_STATE = ROOT / "collector_state.sqlite3"
DEFAULT_PROJECT_ID = "xstudy-problem-bank"
DEFAULT_BUCKET = "xtudynote.firebasestorage.app"
COLLECTION = "textbook_sources"
ALLOWED_RIGHTS = {"public_domain", "open_license", "permission_granted"}
PDF_CONTENT_TYPES = {"application/pdf", "application/octet-stream"}
BLOCKED_FIELD_NAMES = {
    "auth",
    "cookie",
    "cookies",
    "password",
    "screenshot",
    "storage_state",
    "username",
    "viewer_capture",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or f"item-{hashlib.sha256(value.encode('utf-8')).hexdigest()[:12]}"


def normalized_host(value: str) -> str:
    return (urlparse(value).hostname or value).lower().strip(".")


def host_is_allowed(url: str, allowed_domains: list[str]) -> bool:
    host = normalized_host(url)
    return any(host == domain or host.endswith(f".{domain}") for domain in map(normalized_host, allowed_domains))


def is_https(url: str) -> bool:
    return urlparse(url).scheme.lower() == "https"


def validate_pdf_bytes(body: bytes) -> None:
    if not body.startswith(b"%PDF-"):
        raise ValueError("응답 본문이 PDF 서명(%PDF-)으로 시작하지 않습니다.")
    if b"%%EOF" not in body[-16_384:]:
        raise ValueError("PDF 종료 표식(%%EOF)을 확인할 수 없습니다.")


def sha256_hex(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def storage_path(entry: dict[str, Any], digest: str) -> str:
    return "/".join(
        [
            "textbook-files",
            "english",
            slug(entry["curriculum"]),
            slug(entry["course_code"]),
            slug(entry["publisher"]),
            slug(entry["lead_author"]),
            f"{digest}.pdf",
        ]
    )


def catalog_collection_status(existing_status: str | None, has_pdf_url: bool) -> str:
    if existing_status == "collected":
        return "collected"
    if has_pdf_url:
        return "ready_to_collect"
    return "awaiting_authorized_source"


def _find_blocked_fields(value: Any, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else key
            if key.lower() in BLOCKED_FIELD_NAMES:
                found.append(path)
            found.extend(_find_blocked_fields(child, path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(_find_blocked_fields(child, f"{prefix}[{index}]"))
    return found


def validate_entry(entry: dict[str, Any]) -> None:
    required = {
        "id",
        "subject",
        "course_code",
        "course_title",
        "curriculum",
        "provided_year",
        "publisher",
        "lead_author",
        "official_source_page",
        "allowed_domains",
        "rights_status",
    }
    missing = sorted(required - entry.keys())
    if missing:
        raise ValueError(f"{entry.get('id', '<unknown>')}: 필수 필드 누락: {', '.join(missing)}")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{2,120}", str(entry["id"])):
        raise ValueError(f"{entry['id']}: 안전하지 않은 문서 ID입니다.")
    if entry["subject"] != "english":
        raise ValueError(f"{entry['id']}: 이번 수집기는 영어 교과서만 허용합니다.")
    if not entry["allowed_domains"]:
        raise ValueError(f"{entry['id']}: allowed_domains가 비어 있습니다.")
    source_page = entry["official_source_page"]
    if not is_https(source_page) or not host_is_allowed(source_page, entry["allowed_domains"]):
        raise ValueError(f"{entry['id']}: 공식 출처 페이지가 HTTPS 허용 도메인에 속하지 않습니다.")
    blocked = _find_blocked_fields(entry)
    if blocked:
        raise ValueError(f"{entry['id']}: 인증/캡처 우회 필드는 사용할 수 없습니다: {', '.join(blocked)}")

    pdf_url = entry.get("pdf_url")
    if not pdf_url:
        return
    if not is_https(pdf_url) or not host_is_allowed(pdf_url, entry["allowed_domains"]):
        raise ValueError(f"{entry['id']}: PDF URL이 HTTPS 허용 도메인에 속하지 않습니다.")
    if entry["rights_status"] not in ALLOWED_RIGHTS:
        raise ValueError(f"{entry['id']}: 수집 가능한 이용 권한이 확인되지 않았습니다.")
    if not entry.get("permission_evidence"):
        raise ValueError(f"{entry['id']}: permission_evidence가 필요합니다.")


def load_catalog(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    blocked = _find_blocked_fields(payload)
    if blocked:
        raise ValueError(f"카탈로그에 인증/캡처 우회 필드가 있습니다: {', '.join(blocked)}")
    raw_entries = payload.get("textbooks")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise ValueError("카탈로그의 textbooks 배열이 비어 있습니다.")
    defaults = payload.get("defaults") or {}
    publisher_sources = payload.get("publisher_sources") or {}
    entries = []
    ids: set[str] = set()
    for raw_entry in raw_entries:
        publisher = raw_entry.get("publisher")
        entry = {**defaults, **(publisher_sources.get(publisher) or {}), **raw_entry}
        validate_entry(entry)
        if entry["id"] in ids:
            raise ValueError(f"중복 교과서 ID: {entry['id']}")
        ids.add(entry["id"])
        entries.append(entry)
    return entries


class SafeRedirectHandler(HTTPRedirectHandler):
    def __init__(self, allowed_domains: list[str]):
        super().__init__()
        self.allowed_domains = allowed_domains

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        candidate = urljoin(req.full_url, newurl)
        if not is_https(candidate) or not host_is_allowed(candidate, self.allowed_domains):
            raise ValueError("허용되지 않은 도메인으로 리디렉션되었습니다.")
        return super().redirect_request(req, fp, code, msg, headers, candidate)


@dataclass
class DownloadedPdf:
    body: bytes
    digest: str
    final_url: str
    content_type: str


def download_pdf(entry: dict[str, Any], max_bytes: int, timeout_seconds: int) -> DownloadedPdf:
    url = entry["pdf_url"]
    opener = build_opener(SafeRedirectHandler(entry["allowed_domains"]))
    request = Request(
        url,
        headers={
            "Accept": "application/pdf,application/octet-stream;q=0.8",
            "User-Agent": "XstudyTextbookIngestion/1.0 (+permission-aware backend worker)",
        },
    )
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            final_url = response.geturl()
            if not is_https(final_url) or not host_is_allowed(final_url, entry["allowed_domains"]):
                raise ValueError("최종 PDF URL이 허용 도메인에 속하지 않습니다.")
            content_type = response.headers.get_content_type().lower()
            if content_type not in PDF_CONTENT_TYPES:
                raise ValueError(f"허용되지 않은 Content-Type입니다: {content_type}")
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > max_bytes:
                raise ValueError("PDF가 허용된 최대 크기를 초과합니다.")
            body = response.read(max_bytes + 1)
    except (HTTPError, URLError) as error:
        raise RuntimeError(f"PDF 다운로드 실패: {error}") from error
    if len(body) > max_bytes:
        raise ValueError("PDF가 허용된 최대 크기를 초과합니다.")
    validate_pdf_bytes(body)
    return DownloadedPdf(body=body, digest=sha256_hex(body), final_url=final_url, content_type=content_type)


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


class StateStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute(
            """
            CREATE TABLE IF NOT EXISTS textbook_runs (
                textbook_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                sha256 TEXT,
                storage_path TEXT,
                error TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        self.db.commit()

    def record(self, textbook_id: str, status: str, digest: str | None = None,
               object_path: str | None = None, error: str | None = None) -> None:
        self.db.execute(
            """
            INSERT INTO textbook_runs (textbook_id, status, sha256, storage_path, error, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(textbook_id) DO UPDATE SET
                status=excluded.status,
                sha256=excluded.sha256,
                storage_path=excluded.storage_path,
                error=excluded.error,
                updated_at=excluded.updated_at
            """,
            (textbook_id, status, digest, object_path, error, utc_now()),
        )
        self.db.commit()

    def manifest(self) -> list[dict[str, Any]]:
        rows = self.db.execute(
            "SELECT textbook_id, status, sha256, storage_path, error, updated_at FROM textbook_runs ORDER BY textbook_id"
        ).fetchall()
        keys = ["textbook_id", "status", "sha256", "storage_path", "error", "updated_at"]
        return [dict(zip(keys, row)) for row in rows]

    def close(self) -> None:
        self.db.close()


class CloudRepository:
    def __init__(self, project_id: str, bucket_name: str):
        from google.cloud import firestore, storage

        credentials = load_google_credentials()
        self.firestore_module = firestore
        self.db = firestore.Client(project=project_id, credentials=credentials)
        self.storage_client = storage.Client(project=project_id, credentials=credentials)
        self.bucket = self.storage_client.bucket(bucket_name)

    def register_catalog_entry(self, entry: dict[str, Any]) -> None:
        ref = self.db.collection(COLLECTION).document(entry["id"])
        existing = ref.get().to_dict() or {}
        status = catalog_collection_status(
            existing.get("collection_status"), bool(entry.get("pdf_url"))
        )
        ref.set(
            {
                **{key: value for key, value in entry.items() if value is not None},
                "collection_status": status,
                "parse_status": existing.get("parse_status") or "not_started",
                "visibility": "master_only",
                "visible_to_emails": [
                    "waterfallingsound0827@gmail.com",
                    "studymap0904@gmail.com",
                ],
                "source_kind": "official_textbook_catalog",
                "updated_at": self.firestore_module.SERVER_TIMESTAMP,
                "created_at": existing.get("created_at") or self.firestore_module.SERVER_TIMESTAMP,
            },
            merge=True,
        )

    def upload_pdf(self, entry: dict[str, Any], downloaded: DownloadedPdf, object_path: str) -> bool:
        from google.api_core.exceptions import PreconditionFailed

        blob = self.bucket.blob(object_path)
        blob.metadata = {
            "source_url": downloaded.final_url,
            "source_page": entry["official_source_page"],
            "rights_status": entry["rights_status"],
            "sha256": downloaded.digest,
        }
        try:
            blob.upload_from_string(
                downloaded.body,
                content_type="application/pdf",
                if_generation_match=0,
            )
            return True
        except PreconditionFailed:
            return False

    def mark_collected(self, entry: dict[str, Any], downloaded: DownloadedPdf,
                       object_path: str, uploaded: bool) -> None:
        self.db.collection(COLLECTION).document(entry["id"]).set(
            {
                "collection_status": "collected",
                "storage_path": object_path,
                "source_pdf_url": downloaded.final_url,
                "sha256": downloaded.digest,
                "size_bytes": len(downloaded.body),
                "content_type": "application/pdf",
                "uploaded_in_this_run": uploaded,
                "collected_at": self.firestore_module.SERVER_TIMESTAMP,
                "updated_at": self.firestore_module.SERVER_TIMESTAMP,
            },
            merge=True,
        )

    def mark_failed(self, entry: dict[str, Any], message: str) -> None:
        self.db.collection(COLLECTION).document(entry["id"]).set(
            {
                "collection_status": "failed",
                "collection_error": message[:1_000],
                "updated_at": self.firestore_module.SERVER_TIMESTAMP,
            },
            merge=True,
        )


def write_manifest(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"generated_at": utc_now(), "records": records}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def run(args: argparse.Namespace) -> dict[str, int]:
    entries = load_catalog(args.catalog)
    selected = set(args.target or [])
    if selected:
        entries = [entry for entry in entries if entry["id"] in selected]
        missing = selected - {entry["id"] for entry in entries}
        if missing:
            raise ValueError(f"카탈로그에 없는 target: {', '.join(sorted(missing))}")

    summary = {
        "catalog": len(entries),
        "validated": 0,
        "registered": 0,
        "pending": 0,
        "collected": 0,
        "failed": 0,
    }
    state = StateStore(args.state)
    cloud = None if args.dry_run else CloudRepository(args.project_id, args.bucket)
    keep_dir = args.keep_local_dir
    if keep_dir:
        keep_dir.mkdir(parents=True, exist_ok=True)

    try:
        for entry in entries:
            if args.register_catalog:
                if cloud:
                    cloud.register_catalog_entry(entry)
                    summary["registered"] += 1
                else:
                    summary["validated"] += 1

            if not args.collect:
                state.record(entry["id"], "catalog_registered" if cloud else "catalog_validated")
                continue
            if not entry.get("pdf_url"):
                summary["pending"] += 1
                state.record(entry["id"], "awaiting_authorized_source")
                continue
            try:
                downloaded = download_pdf(entry, args.max_bytes, args.timeout_seconds)
                object_path = storage_path(entry, downloaded.digest)
                if keep_dir:
                    (keep_dir / f"{entry['id']}-{downloaded.digest[:12]}.pdf").write_bytes(downloaded.body)
                uploaded = cloud.upload_pdf(entry, downloaded, object_path) if cloud else False
                if cloud:
                    cloud.mark_collected(entry, downloaded, object_path, uploaded)
                state.record(entry["id"], "collected" if cloud else "download_validated", downloaded.digest, object_path)
                summary["collected"] += 1
            except Exception as error:  # one target must not stop the remaining batch
                message = str(error)
                summary["failed"] += 1
                state.record(entry["id"], "failed", error=message)
                if cloud:
                    cloud.mark_failed(entry, message)
        write_manifest(args.manifest, state.manifest())
    finally:
        state.close()
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect authorized public textbook PDFs into Xstudy Problem Bank")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--manifest", type=Path, default=ROOT / "manifest.local.json")
    parser.add_argument("--project-id", default=os.getenv("PROBLEM_BANK_PROJECT_ID", DEFAULT_PROJECT_ID))
    parser.add_argument("--bucket", default=os.getenv("TEXTBOOK_STORAGE_BUCKET", DEFAULT_BUCKET))
    parser.add_argument("--register-catalog", action="store_true")
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--target", action="append")
    parser.add_argument("--keep-local-dir", type=Path)
    parser.add_argument("--max-bytes", type=int, default=250 * 1024 * 1024)
    parser.add_argument("--timeout-seconds", type=int, default=90)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if not args.register_catalog and not args.collect:
        args.register_catalog = True
        args.collect = True
    summary = run(args)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
