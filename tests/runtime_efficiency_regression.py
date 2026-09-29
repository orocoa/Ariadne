"""Synthetic streaming, PDF admission and cancellation; no providers or user files."""
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.conversation_events import Preview, PublicPreviewParser, SINK, encode
from src.codex_app_server import PublicEvents, Channel
from src.pdf_delivery import inspect_complete_pdf, render_complete_pdf_pages, validate_page_geometry, PDF_RENDERER, PDF_METADATA, PUBLIC_PDF_LIMITS, pdf_preparation, _run_pdf_render
from src.browser_pdf_delivery import BrowserPDFDelivery
from src.runtime_cancellation import CANCEL, Cancellation, ExecutionCancelled
from src.candidate_conversation_runtime import CandidateConversationExecutionRegistry

ROOT = Path(__file__).resolve().parents[1]

class EfficiencyTests(unittest.TestCase):
    def test_all_public_paths_and_private_same_names_in_every_chunk_boundary(self):
        samples = [
            ({'source': {'message': 'PRIVATE'}, 'message': '公开😀引号"换行\n尾'}, '公开😀引号"换行\n尾'),
            ({'patches': [{'summary': 'PRIVATE'}], 'semantic_action': {'private': {'message': 'PRIVATE'}, 'message': '说明'}}, '说明'),
            ({'deliverable': {'body': '{"message":"PRIVATE"}'}, 'summary': '结论'}, '结论'),
            ({'source': {'semantic_action': {'message': 'PRIVATE'}}, 'list': [{'message': 'PRIVATE'}]}, ''),
        ]
        for value, expected in samples:
            raw = json.dumps(value, ensure_ascii=True)
            for step in [1, 2, 7, 31]:
                parser = PublicPreviewParser()
                for i in range(0, len(raw), step):
                    partial = parser.feed(raw[i:i+step])
                    self.assertNotIn('PRIVATE', partial)
                    self.assertTrue(expected.startswith(partial), repr(partial))
                self.assertEqual(parser.text, expected)
        for raw in ['{"source": invalid, "message":"PRIVATE"}', '{"source":[{"message":"PRIVATE"}', '{"x":"\\q","summary":"PRIVATE"}']:
            self.assertEqual(PublicPreviewParser().feed(raw), '')

    def test_preview_replacement_and_linear_parser_work(self):
        seen = []; token = SINK.set(seen.append)
        try:
            preview = Preview()
            raw = json.dumps({'message':'文'*2000, 'deliverable': {'body':'PRIVATE'*10000}}, ensure_ascii=False)
            for i in range(0,len(raw),20): preview.append(raw[i:i+20])
            self.assertLess(preview.parser.seen, 2100)
            preview.update('{"summary":"replacement"}')
            self.assertEqual(seen[-1], {'type':'preview', 'text':'replacement'})
            self.assertNotIn('PRIVATE', json.dumps(seen))
        finally: SINK.reset(token)

    def test_commentary_wire_linear_deduplicated_and_bounded(self):
        counts = {'bytes': 0, 'events': 0}; reconstructed = ''
        def sink(event):
            nonlocal reconstructed
            counts['events'] += 1
            counts['bytes'] += len(encode({**event, 'seq': counts['events']}))
            reconstructed = reconstructed + event['text'] if event['type'] == 'commentary_delta' else event['text']
        token = SINK.set(sink)
        try:
            events = PublicEvents('t','r',False,1)
            def e(method, **p): return {'method':method, 'params':{'threadId':'t','turnId':'r',**p}}
            events.accept(e('item/started', item={'id':'c','type':'agentMessage','phase':'commentary'}))
            for _ in range(6500): events.accept(e('item/agentMessage/delta', itemId='c', delta='文'))
            events.accept(e('item/completed', item={'id':'c','type':'agentMessage','phase':'commentary','text':'文'*6500}))
            self.assertEqual(reconstructed, '文'*6000)
            self.assertEqual(counts['events'], 6000)
            self.assertLess(counts['bytes'], 600000)
        finally: SINK.reset(token)

    def test_pdf_rejects_before_rasterization_and_reads_metadata_only(self):
        good = b'Pages: 2\nPage 1 size: 595 x 842 pts\nPage 2 size: 595 x 842 pts\n'
        with patch('src.pdf_delivery.subprocess.run', return_value=subprocess.CompletedProcess([],0,good)) as command:
            self.assertEqual(inspect_complete_pdf(b'%PDF-synthetic', max_pages=48), 2)
            self.assertEqual(command.call_count, 1)
            self.assertEqual(command.call_args.args[0][0], 'pdfinfo')
        for output in [b'Pages: 81\n', b'Pages: 1\nPage 1 size: 100000 x 100000 pts\n',
                       b'Pages: 2\nPage 1 size: 595 x 842 pts\n']:
            with patch('src.pdf_delivery.subprocess.run', return_value=subprocess.CompletedProcess([],0,output)) as command:
                with self.assertRaises(ValueError): render_complete_pdf_pages(b'%PDF-synthetic')
                self.assertEqual(command.call_count, 1)
        with self.assertRaises(ValueError): validate_page_geometry([(2200,2200)]*80)

    def test_public_poppler_preflight_counts_upscaled_small_pages(self):
        output = 'Pages: 40\n' + ''.join(f'Page {n} size: 100 x 100 pts\n' for n in range(1, 41))
        token = PUBLIC_PDF_LIMITS.set(True)
        try:
            with patch('src.pdf_delivery.subprocess.run', return_value=subprocess.CompletedProcess([],0,output.encode())), \
                 patch('src.pdf_delivery._run_pdf_render') as raster:
                with self.assertRaisesRegex(ValueError, 'pdf_pixel_budget_exceeded'):
                    render_complete_pdf_pages(b'%PDF-synthetic',max_pages=48)
                raster.assert_not_called()
        finally: PUBLIC_PDF_LIMITS.reset(token)

    def test_web_metadata_preflight_needs_no_pixels_and_cache_is_request_owned(self):
        raw = (ROOT/'public/provider-visual-check.pdf').read_bytes()
        renderer = BrowserPDFDelivery([], page_counter=lambda _: 2)
        token = PDF_RENDERER.set(renderer)
        try:
            self.assertEqual(inspect_complete_pdf(raw, max_pages=48), 2)
            self.assertEqual(renderer.cache, {})
            with self.assertRaises(ValueError): render_complete_pdf_pages(raw)
        finally: PDF_RENDERER.reset(token)
        self.assertIsNone(PDF_RENDERER.get())

    def test_whole_attachment_group_admitted_before_first_raster_and_cache_discarded(self):
        from src.conversation_attachments import augment_payload
        class Error(ValueError):
            def __init__(self, code, *_): super().__init__(code)
        for metrics in [{"pages": 30, "pixels": 1_000_000}, {"pages": 20, "pixels": 80_000_000}]:
            with patch('src.conversation_attachments.validate_attachments', return_value=[('a.pdf','application/pdf',b'%PDF-a'),('b.pdf','application/pdf',b'%PDF-b')]), \
                 patch('src.pdf_delivery._inspect_path', return_value=metrics), \
                 patch('src.pdf_delivery._run_pdf_render') as raster:
                with self.assertRaises(Error): augment_payload({'messages':[]}, {}, Error)
                raster.assert_not_called()
            self.assertIsNone(PDF_METADATA.get())
        with patch('src.pdf_delivery._inspect_path', return_value={"pages":2,"pixels":1_000_000}) as inspect:
            with pdf_preparation([b'%PDF-a',b'%PDF-a']):
                self.assertEqual(inspect_complete_pdf(b'%PDF-a'),2)
                self.assertEqual(inspect.call_count,1)
            with pdf_preparation([b'%PDF-a']): self.assertEqual(inspect.call_count,2)
        self.assertIsNone(PDF_METADATA.get())

    def test_renderer_is_stopped_as_soon_as_disk_budget_is_observed(self):
        from types import SimpleNamespace
        class Process:
            pid=1234
            stopped=False
            def poll(self): return 0 if self.stopped else None
            def wait(self, timeout):
                if self.stopped: return 0
                raise subprocess.TimeoutExpired('synthetic-renderer',timeout)
        process=Process()
        directory=SimpleNamespace(glob=lambda _: [SimpleNamespace(stat=lambda: SimpleNamespace(st_size=40_000_001))])
        def stop(*_): process.stopped=True
        with patch('src.pdf_delivery.subprocess.Popen',return_value=process), patch('src.pdf_delivery.os.killpg',side_effect=stop) as kill:
            with self.assertRaisesRegex(ValueError,'rendered_pages_exceed_request_limit'):
                _run_pdf_render(['synthetic-renderer'],directory)
            self.assertTrue(process.stopped); kill.assert_called_once()

    def test_pdf_cancellation_keeps_its_identity_at_delivery_boundary(self):
        with patch('src.pdf_delivery._metadata', return_value={"pages": 1, "pixels": 1}), \
             patch('src.pdf_delivery._run_pdf_render', side_effect=ExecutionCancelled("EXECUTION_CANCELLED")):
            with self.assertRaises(ExecutionCancelled): render_complete_pdf_pages(b'%PDF-synthetic')

    def test_explicit_cancel_interrupts_channel_without_cancelling_other_request(self):
        registry = CandidateConversationExecutionRegistry()
        state, other = Cancellation(), Cancellation()
        token = CANCEL.set(state)
        try:
            self.assertTrue(registry.begin('execution','generation'))
            self.assertFalse(registry.cancel('execution','other'))
            state.check()
            called=[]; unregister=state.register(lambda: called.append(True))
            self.assertTrue(registry.cancel('execution','generation'))
            self.assertEqual(called,[True]); unregister(); other.check()
            class Process: stdin=io.BytesIO()
            channel=Channel(Process(), 30); channel.buffer=b'{"result":{}}\n'
            with self.assertRaises(ExecutionCancelled): channel.read()
            self.assertFalse(registry.accept('execution','generation'))
        finally: CANCEL.reset(token)
        self.assertIsNone(CANCEL.get())

if __name__ == '__main__': unittest.main()
