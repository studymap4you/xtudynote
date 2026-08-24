import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("textbook_collector.py")
SPEC = importlib.util.spec_from_file_location("textbook_collector", MODULE_PATH)
collector = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = collector
SPEC.loader.exec_module(collector)


class TextbookCollectorTest(unittest.TestCase):
    def test_catalog_contains_all_36_screenshot_targets(self):
        entries = collector.load_catalog(Path(__file__).with_name("catalog.json"))
        self.assertEqual(36, len(entries))
        counts = {}
        for entry in entries:
            counts[entry["course_code"]] = counts.get(entry["course_code"], 0) + 1
        self.assertEqual(
            {"common_english_1": 10, "common_english_2": 10, "english_1": 8, "english_2": 8},
            counts,
        )

    def test_allowed_domain_does_not_accept_lookalike_host(self):
        self.assertTrue(collector.host_is_allowed("https://cdn.example.com/a.pdf", ["example.com"]))
        self.assertFalse(collector.host_is_allowed("https://example.com.attacker.test/a.pdf", ["example.com"]))

    def test_pdf_validation_checks_signature_and_eof(self):
        collector.validate_pdf_bytes(b"%PDF-1.7\nhello\n%%EOF\n")
        with self.assertRaises(ValueError):
            collector.validate_pdf_bytes(b"<html>login</html>")
        with self.assertRaises(ValueError):
            collector.validate_pdf_bytes(b"%PDF-1.7\ntruncated")

    def test_pdf_url_requires_explicit_reuse_permission(self):
        entry = {
            "id": "sample_book",
            "subject": "english",
            "course_code": "english_1",
            "course_title": "영어 I",
            "curriculum": "2022_revision",
            "provided_year": 2026,
            "publisher": "Sample",
            "lead_author": "Author",
            "official_source_page": "https://publisher.example/book",
            "allowed_domains": ["publisher.example"],
            "rights_status": "permission_required",
            "pdf_url": "https://publisher.example/book.pdf",
        }
        with self.assertRaisesRegex(ValueError, "이용 권한"):
            collector.validate_entry(entry)

    def test_blocked_session_fields_are_rejected(self):
        payload = {
            "textbooks": [{"id": "bad", "storage_state": "session.json"}],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "인증/캡처 우회"):
                collector.load_catalog(path)

    def test_storage_path_is_content_addressed(self):
        entry = {
            "curriculum": "2022_revision",
            "course_code": "common_english_1",
            "publisher": "NE Neungyule",
            "lead_author": "Min Byeong-cheon",
        }
        path = collector.storage_path(entry, "a" * 64)
        self.assertEqual(
            "textbook-files/english/2022-revision/common-english-1/ne-neungyule/min-byeong-cheon/"
            + "a" * 64
            + ".pdf",
            path,
        )

    def test_catalog_status_advances_when_authorized_url_is_added(self):
        self.assertEqual(
            "ready_to_collect",
            collector.catalog_collection_status("awaiting_authorized_source", True),
        )
        self.assertEqual(
            "collected",
            collector.catalog_collection_status("collected", False),
        )


if __name__ == "__main__":
    unittest.main()
