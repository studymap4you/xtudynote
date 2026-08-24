import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("xuniverse_ebsi_collector.py")
SPEC = importlib.util.spec_from_file_location("xuniverse_ebsi_collector", MODULE_PATH)
collector = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = collector
SPEC.loader.exec_module(collector)


class CollectorParsingTest(unittest.TestCase):
    def test_selects_pdf_explanation_over_answer_image(self):
        markup = """
        <div class="qus_tit">고1 3월 학평(서울)&nbsp;영어</div>
        <button onclick="goDownLoadP('/2025/question.pdf', '', '', '', '', '', '', '', '')">문제</button>
        <button onclick="goDownLoadJ('https://wdown.ebsi.co.kr/path/answer.png', '', '', '', '', '', '', '', '')">정답</button>
        <button onclick="goDownLoadH('/2025/explanation.pdf', '', '', '', '', '', '', '', '')">해설</button>
        <button onclick="goDownLoadD('/2025/script.pdf', '', '', '', '', '', '', '', '')">대본</button>
        """
        title, candidates = collector.discover_candidates(markup)
        by_type = {item.file_type: item for item in candidates}
        self.assertIn("고1 3월", title)
        self.assertEqual(by_type["answer"].source_kind, "H")
        self.assertTrue(by_type["question"].url.endswith("/2025/question.pdf"))
        self.assertTrue(by_type["script"].url.endswith("/2025/script.pdf"))

    def test_rejects_non_ebsi_download_hosts(self):
        markup = "<button onclick=\"goDownLoadJ('https://example.com/answer.pdf')\">정답</button>"
        _, candidates = collector.discover_candidates(markup)
        self.assertEqual(candidates, [])

    def test_deterministic_ids(self):
        self.assertEqual(collector.exam_id(2, 2025, 9), "exam_english_g2_2025_09")
        self.assertEqual(collector.target_id(3, 2024, 10), "g3_2024_10")


if __name__ == "__main__":
    unittest.main()
