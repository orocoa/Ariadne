"""App Server public-event and isolation contracts; no network/model calls."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.codex_app_server import PublicEvents, check_policy, Channel, overrides
from src.codex_account import environment, directory
from src.conversation_events import SINK
from src.codex_runtime import DISABLED_FEATURES, CODEX_MODEL

def event(method, **params):
    return {'method': method, 'params': {'threadId': 't', 'turnId': 'r', **params}}

class AppServerTests(unittest.TestCase):
    def test_public_stream_before_terminal_no_reasoning_or_json(self):
        seen = []; token = SINK.set(seen.append)
        try:
            p = PublicEvents('t', 'r', False, 12)
            p.accept(event('item/started', item={'id': 'private', 'type': 'reasoning'}))
            p.accept(event('item/reasoning/summaryTextDelta', itemId='private', delta='PRIVATE'))
            p.accept(event('item/completed', item={'id': 'private', 'type': 'reasoning', 'summary': ['PRIVATE']}))
            p.accept(event('item/started', item={'id': 'public', 'type': 'agentMessage', 'phase': 'commentary'}))
            for text in ['Public ', 'status']: p.accept(event('item/agentMessage/delta', itemId='public', delta=text))
            p.accept(event('item/started', item={'id': 'final', 'type': 'agentMessage', 'phase': 'final_answer'}))
            raw = json.dumps({'patches': [{'message': 'PRIVATE'}], 'message': 'Evidence ' * 20})
            for index in range(0, len(raw), 7): p.accept(event('item/agentMessage/delta', itemId='final', delta=raw[index:index+7]))
            self.assertFalse(p.completed)
            self.assertGreater(len([e for e in seen if e['type'] in {'preview', 'preview_delta'}]), 3)
            self.assertNotIn('PRIVATE', json.dumps(seen))
            self.assertEqual([e for e in seen if e['type'] == 'activity'], [
                {'type': 'activity', 'id': 'private', 'activity': 'thinking', 'state': 'started'},
                {'type': 'activity', 'id': 'private', 'activity': 'thinking', 'state': 'completed'}])
            self.assertEqual([(e['type'], e['text']) for e in seen if e['type'].startswith('commentary')], [('commentary', 'Public '), ('commentary_delta', 'status')])
            p.accept(event('item/completed', item={'id': 'final', 'type': 'agentMessage', 'phase': 'final_answer', 'text': raw}))
            p.accept(event('turn/completed', turn={'id': 'r', 'status': 'completed'}))
            self.assertTrue(p.completed); self.assertIn(b'turn.completed', p.result_events())
        finally: SINK.reset(token)

    def test_failed_incomplete_foreign_and_extra_tool_rejected(self):
        for bad in [event('turn/completed', turn={'id': 'r', 'status': 'completed'}),
                    event('turn/completed', turn={'id': 'r', 'status': 'failed'}),
                    event('item/agentMessage/delta', itemId='missing', delta='x'),
                    event('item/started', item={'id': 's', 'type': 'webSearch'}),
                    event('item/started', item={'id': 's', 'type': 'commandExecution'}),
                    event('item/started', item={'id': 's', 'type': 'mcpToolCall'}),
                    event('turn/started', threadId='foreign')]:
            with self.assertRaises(ValueError): PublicEvents('t', 'r', False, 12).accept(bad)
        with self.assertRaises(ValueError): PublicEvents('t', 'r', False, 12).result_events()

    def test_search_only_authorized_and_bounded(self):
        p = PublicEvents('t', 'r', True, 1)
        p.accept(event('item/started', item={'id': 's', 'type': 'webSearch', 'action': {'type': 'openPage', 'url': 'https://python.org'}}))
        p.accept(event('item/completed', item={'id': 's', 'type': 'webSearch', 'action': {'type': 'openPage', 'url': 'https://python.org'}}))
        self.assertEqual(p.legacy[-1]['item']['action']['type'], 'open_page')
        with self.assertRaises(ValueError): p.accept(event('item/started', item={'id': 'second', 'type': 'webSearch'}))

    def test_public_tool_lifecycle_has_no_query_or_page_contents(self):
        seen = []; token = SINK.set(seen.append)
        try:
            p = PublicEvents('t', 'r', True, 12)
            for i, (action, kind) in enumerate([('search', 'search'), ('openPage', 'reading'), ('findInPage', 'finding')]):
                for phase in ['started', 'completed']:
                    p.accept(event('item/' + phase, item={'id': str(i), 'type': 'webSearch', 'action': {'type': action, 'query': 'PRIVATE', 'url': 'PRIVATE'}}))
                    self.assertEqual(seen[-1], {'type': 'activity', 'id': str(i), 'activity': kind, 'state': phase})
            self.assertNotIn('PRIVATE', json.dumps(seen))
        finally: SINK.reset(token)

    def test_policy_and_account(self):
        good = {'model': CODEX_MODEL, 'modelProvider': 'ariadne-openai', 'cwd': '/tmp/probe',
                'approvalPolicy': 'never', 'sandbox': {'type': 'readOnly'}, 'thread': {'ephemeral': True},
                'instructionSources': [], 'reasoningEffort': 'medium'}
        check_policy(good, CODEX_MODEL, Path('/tmp/probe'), 'medium')
        for key, value in [('model', 'other'), ('modelProvider', 'other'), ('cwd', '/'),
                           ('approvalPolicy', 'on-request'), ('sandbox', {'type': 'dangerFullAccess'}),
                           ('thread', {'ephemeral': False}), ('instructionSources', ['AGENTS.md']), ('reasoningEffort', 'low')]:
            with self.assertRaises(ValueError): check_policy({**good, key: value}, CODEX_MODEL, Path('/tmp/probe'), 'medium')
        with patch.dict('os.environ', {'CODEX_HOME': '/host', 'CODEX_THREAD_ID': 'secret', 'OPENAI_API_KEY': 'secret', 'MCP_PIPE': 'secret'}):
            isolated = environment()
            self.assertEqual(isolated['CODEX_HOME'], str(directory()))
            self.assertFalse(any(k in isolated for k in ['CODEX_THREAD_ID', 'OPENAI_API_KEY', 'MCP_PIPE']))
        values = overrides(Path('/tmp/probe'), 'medium', True, DISABLED_FEATURES)
        self.assertTrue(values['features.code_mode'])
        self.assertFalse(values['features.shell_tool'])

    def test_server_permission_request_is_denied(self):
        class Process: stdin = io.BytesIO()
        p = Process(); c = Channel(p, 10)
        c.buffer = b'{"id":4,"method":"item/commandExecution/requestApproval"}\n'
        with self.assertRaisesRegex(ValueError, 'UNEXPECTED_TOOL'): c.read()
        self.assertIn(b'error', p.stdin.getvalue())

if __name__ == '__main__': unittest.main()
