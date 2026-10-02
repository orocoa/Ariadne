"""Offline qualification: consent, exact visual results, persistence and identity."""
import base64
from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
import re
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import codex_models as Models, codex_verification as V
from src.model_settings import envelope, validate

ROW = {'model': 'synthetic-future-model', 'display_name': 'Synthetic model', 'efforts': ['low', 'high'],
       'default_effort': 'low', 'input_modalities': ['text', 'image'], 'unsupported_efforts': []}
CTX = {'account': 'synthetic-account', 'binary': 'synthetic-binary', 'adapter': 'synthetic-adapter'}
RESULT = {'status': 'VERIFIED', 'adapter': V.ADAPTER, 'check_version': V.CHECK_VERSION,
          'display_name': ROW['display_name'], 'efforts': ROW['efforts'], 'default_effort': 'low'}


class VerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.v = V.Verification(self.temp.name)
        self.threads = []
        def thread(**kwargs):
            self.threads.append(kwargs)
            class Pending:
                def start(self): pass
            return Pending()
        for target, value in [('src.codex_verification.context', lambda: CTX.copy()),
                              ('src.codex_verification.service', lambda: self.v),
                              ('src.codex_verification.start_worker', thread),
                              ('src.codex_models.discover', lambda **kw: [ROW.copy()])]:
            p = patch(target, value); p.start(); self.addCleanup(p.stop)
        p = patch.object(Models, '_identity', {'account': CTX['account'], 'binary': CTX['binary']})
        p.start(); self.addCleanup(p.stop)

    def finish(self, result=RESULT, error=None):
        job = self.threads[-1]
        with patch.object(V, 'probe', return_value=result, side_effect=error) as probe:
            job['target'](*job['args'])
            return probe

    def enable(self):
        return self.v.configure({'enabled': True, 'consent': True}, [ROW])

    def test_discovery_and_missing_consent_never_start_inference(self):
        self.assertFalse(self.v.refresh([ROW])['enabled'])
        for body in ({'enabled': True, 'consent': False}, {'enabled': True}, {'prompt': 'anything'}):
            with self.assertRaises(ValueError): self.v.configure(body, [ROW])
        self.assertEqual(self.threads, [])
        self.assertFalse(Models.qualified(ROW['model']))

    def test_concurrent_refresh_is_single_attempt_and_persistent(self):
        self.enable()
        second = V.Verification(self.temp.name)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda i: (self.v if i % 2 else second).refresh([ROW]), range(10)))
        self.assertEqual(len(self.threads), 1)
        self.finish()
        self.assertTrue(Models.qualified(ROW['model']))
        validate(envelope('codex', ROW['model'], {'reasoning_effort': 'high'}), 'codex', ROW['model'])
        self.v = V.Verification(self.temp.name)
        self.assertTrue(self.v.refresh([ROW])['enabled'])
        self.assertTrue(Models.qualified(ROW['model']))
        self.assertEqual(len(self.threads), 1)

    def test_failure_has_no_automatic_retry(self):
        self.enable(); self.finish(error=ValueError('VISUAL_RESULT_MISMATCH'))
        state = self.v.refresh([ROW])['models'][ROW['model']]
        self.assertEqual(state['status'], 'FAILED'); self.assertTrue(state['can_retry'])
        self.assertFalse(Models.qualified(ROW['model']))
        self.v.refresh([ROW]); self.assertEqual(len(self.threads), 1)
        self.v.configure({'retry': ROW['model'], 'consent': True}, [ROW])
        self.assertEqual(len(self.threads), 2)

    def test_new_model_execution_preserves_account_binding(self):
        from src.codex_runtime import call_codex
        from src.runtime_binding import CODEX_CREDENTIAL
        self.enable(); self.finish()
        payload = {'model': ROW['model'], 'reasoning_effort': 'low'}
        with patch('src.codex_runtime.codex_enabled', return_value=True), patch('src.codex_runtime._execute', return_value=(200, {})) as execute:
            call_codex(CODEX_CREDENTIAL, payload)
            self.assertEqual(execute.call_args.args[0]['_verification_identity'], Models.discovery_identity())
        self.assertNotIn('_verification_identity', payload)

    def test_daily_limit_survives_reload_and_manual_retry(self):
        self.enable()
        for _ in range(2):
            self.finish(error=TimeoutError('CODEX_TIMEOUT'))
            self.v.configure({'retry': ROW['model'], 'consent': True}, [ROW])
        self.finish(error=TimeoutError('CODEX_TIMEOUT'))
        self.v = V.Verification(self.temp.name)
        state = self.v.refresh([ROW])
        self.assertFalse(state['models'][ROW['model']]['can_retry'])
        self.assertEqual(len(self.threads), 3)
        self.v.configure({'retry': ROW['model'], 'consent': True}, [ROW])
        self.assertEqual(len(self.threads), 3)

    def test_disable_cancels_and_never_grants_qualification(self):
        self.enable(); self.v.configure({'enabled': False, 'consent': False}, [ROW])
        probe = self.finish()
        probe.assert_not_called()
        self.assertFalse(Models.qualified(ROW['model']))
        self.assertEqual(self.v.refresh([ROW])['models'][ROW['model']]['status'], 'INTERRUPTED')

    def test_context_change_invalidates_and_requires_account_consent(self):
        self.enable(); self.finish()
        for key in CTX:
            with patch.object(V, 'context', return_value={**CTX, key: 'changed'}):
                self.assertFalse(Models.qualified(ROW['model']))
                if key == 'account': self.assertFalse(self.v.refresh([ROW])['enabled'])

    def test_account_change_before_probe_is_rejected(self):
        self.enable()
        with patch.object(V, 'context', return_value={**CTX, 'account': 'changed'}):
            self.finish().assert_not_called()
        self.assertFalse(Models.qualified(ROW['model']))

    def test_text_only_and_unsupported_effort_do_not_run(self):
        rows = [{**ROW, 'input_modalities': ['text']}, {**ROW, 'model': 'ultra-only', 'efforts': []}]
        self.v.configure({'enabled': True, 'consent': True}, rows)
        self.assertEqual(self.threads, [])

    def test_abandoned_attempt_requires_explicit_retry(self):
        self.enable()
        with self.v.state() as data:
            data['records'][V.key_for(CTX, ROW['model'])]['started'] = time.time() - 1000
        self.assertEqual(self.v.refresh([ROW])['models'][ROW['model']]['status'], 'INTERRUPTED')
        self.assertEqual(len(self.threads), 1)
        self.finish()
        self.assertFalse(Models.qualified(ROW['model']), 'late result cannot grant an expired attempt')

    def test_corrupt_and_symlink_records_fail_closed(self):
        self.enable(); self.finish()
        path = Path(self.temp.name) / 'state.json'
        original = path.read_text()
        for field in ('default_effort', 'display_name', 'efforts'):
            data = json.loads(original)
            del data['records'][V.key_for(CTX, ROW['model'])][field]
            path.write_text(json.dumps(data))
            self.assertFalse(Models.qualified(ROW['model']))
            self.assertTrue(Models.settings_entries(), 'malformed cached qualification cannot break builtin models')
        path.write_text('{bad')
        self.assertFalse(Models.qualified(ROW['model']))
        with self.assertRaises(ValueError): self.v.refresh([ROW])
        from src.product_application import skill_handler
        class Base:
            def send_json(self, status, body): self.receipt = status, body
        handler = skill_handler(Base)()
        rows = [*Models.normalize_listing([{'model':'gpt-6-luna','displayName':'Luna','inputModalities':['text','image'],
            'supportedReasoningEfforts':[{'reasoningEffort':'low'}]}]), ROW]
        with patch.object(Models, 'discover', return_value=rows), patch('src.product_application.codex_enabled', return_value=True):
            handler.runtime_options()
        self.assertEqual(handler.receipt[0], 200)
        self.assertEqual(handler.receipt[1]['models'][0]['model_id'], 'gpt-6-luna')
        self.assertFalse(handler.receipt[1]['verification']['available'])

    def test_http_boundary_rejects_arbitrary_payloads(self):
        from src.product_application import skill_handler
        class Base:
            def local_request_allowed(self): return True
            def send_json(self, status, body): self.receipt = (status, body)
        handler = skill_handler(Base)()
        handler.path = '/api/codex-verification'
        with patch('src.product_application.codex_enabled', return_value=True):
            for payload in ({'enabled': True, 'consent': False}, {'model': ROW['model'], 'messages': ['private']}, []):
                raw = json.dumps(payload).encode()
                handler.headers = {'Content-Length': str(len(raw))}; handler.rfile = io.BytesIO(raw)
                handler.do_POST(); self.assertEqual(handler.receipt[0], 400)
        self.assertEqual(self.threads, [])


class ProbeTests(unittest.TestCase):
    def render(self, pdf):
        return [(str(i + 1), text) for i, text in enumerate(re.findall(rb'\((ARIADNE [A-F0-9]+)\) Tj', pdf))]

    def execute(self, payload, timeout):
        parts = payload['messages'][0]['content']
        readings = [base64.b64decode(p['image_url']['url'].split(',')[1]).decode() for p in parts[1:]]
        self.assertEqual(len(readings), 3)
        self.assertTrue(all(text not in parts[0]['text'] for text in readings))
        self.assertEqual(timeout, 180)
        self.assertEqual(payload['_verification_identity'], {k: CTX[k] for k in ('account', 'binary')})
        return 200, {'model': payload['model'], 'usage': {'total_tokens': 42}, 'choices': [{'message': {'tool_calls': [
            {'function': {'name': 'verify_visual_reading', 'arguments': json.dumps({'readings': readings})}}]}}]}

    def test_random_visual_only_answers_and_complete_pages(self):
        with patch('src.pdf_delivery.render_complete_pdf_pages', side_effect=self.render), patch('src.codex_runtime._execute', side_effect=self.execute):
            result = V.probe(ROW, CTX)
            self.assertEqual(result['status'], 'VERIFIED'); self.assertEqual(result['pages'], 2)
            self.assertEqual(result['verified_effort'], 'low')

    def test_partial_pdf_refused_before_provider(self):
        with patch('src.pdf_delivery.render_complete_pdf_pages', return_value=[('1', b'one')]), patch('src.codex_runtime._execute') as execute:
            with self.assertRaisesRegex(ValueError, 'pdf_page_render_failed'): V.probe(ROW, CTX)
            execute.assert_not_called()

    def test_wrong_model_or_readings_never_qualify(self):
        def wrong(payload, timeout):
            status, response = self.execute(payload, timeout)
            response['model'] = 'other-model'
            return status, response
        with patch('src.pdf_delivery.render_complete_pdf_pages', side_effect=self.render), patch('src.codex_runtime._execute', side_effect=wrong):
            with self.assertRaisesRegex(ValueError, 'VISUAL_RESULT_MISMATCH'): V.probe(ROW, CTX)


if __name__ == '__main__': unittest.main()
