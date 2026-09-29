"""Public PDF limits: all pages or explicit rejection, never a partial render."""
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
from src.pdf_delivery import PUBLIC_PDF_LIMITS, render_complete_pdf_pages
from src.ai_career_ingestion import AICareerIngestionError


class PublicPDFTests(unittest.TestCase):
    def test_page_limit_is_checked_before_render_and_context_restored(self):
        token = PUBLIC_PDF_LIMITS.set(True)
        try:
            with patch('src.pdf_delivery.subprocess.run', return_value=subprocess.CompletedProcess([], 0, b'Pages: 49\n')) as command:
                with self.assertRaises(AICareerIngestionError):
                    render_complete_pdf_pages(b'%PDF-synthetic')
                self.assertEqual(command.call_count, 1)
                self.assertEqual(command.call_args.args[0][0], 'pdfinfo')
        finally:
            PUBLIC_PDF_LIMITS.reset(token)
        self.assertFalse(PUBLIC_PDF_LIMITS.get())

    def test_complete_render_and_partial_rejection(self):
        actual_pages = [2]
        def command(argv, **kwargs):
            if argv[0] == 'pdfinfo':
                return subprocess.CompletedProcess(argv, 0, b'Pages: 2\nPage 1 size: 595 x 842 pts\nPage 2 size: 595 x 842 pts\n')
            self.assertIn('-scale-to', argv)
            for page in range(1, actual_pages[0] + 1):
                Path(argv[-1] + '-' + str(page) + '.jpg').write_bytes(b'synthetic-page')
            return subprocess.CompletedProcess(argv, 0)
        token = PUBLIC_PDF_LIMITS.set(True)
        try:
            with patch('src.pdf_delivery.subprocess.run', command), patch('src.pdf_delivery._run_pdf_render', lambda argv, directory: command(argv)):
                self.assertEqual([page for page, _ in render_complete_pdf_pages(b'%PDF-synthetic')], ['1', '2'])
                actual_pages[0] = 1
                with self.assertRaises(AICareerIngestionError):
                    render_complete_pdf_pages(b'%PDF-synthetic')
        finally:
            PUBLIC_PDF_LIMITS.reset(token)


if __name__ == '__main__':
    unittest.main()
