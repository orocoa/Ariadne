"""Offline search evidence, personal-data write isolation and phase gating."""
import copy
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import sys
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import conversation_search as Search
from src.codex_runtime import parse_events, command
from src.conversation_delivery import conversation_delivery
from src.runtime_binding import CODEX_CREDENTIAL

source = {'title': 'Python 官方文档', 'url': 'https://docs.python.org/3/library/dataclasses.html'}
web = {'type': 'web_search', 'id': 'search-1', 'action': {'type': 'search', 'query': 'Python dataclasses'}}
def events(output, items=(), failed=False):
    return '\n'.join(json.dumps(e) for e in [
        {'type': 'thread.started', 'thread_id': 'synthetic'},
        *[{'type': 'item.completed', 'item': item} for item in items],
        {'type': 'item.completed', 'item': {'type': 'agent_message', 'text': json.dumps(output)}},
        {'type': 'turn.failed' if failed else 'turn.completed'}])
def rejects(output, items=(web,), **kwargs):
    try: parse_events(events(output, items, kwargs.pop('failed', False)), 'deliver_personal_understanding', **kwargs)
    except (ValueError, TypeError): pass
    else: raise AssertionError((output, items))
base = {'message': '官方文档属于外部参考；你提供的原型自述仍是另一来源。', 'proposals': [], 'card_proposals': [], 'external_sources': [source]}
response = parse_events(events(base, [web]), 'deliver_personal_understanding', allow_search=True)
assert response['web_search']['authority'] == 'EXTERNAL_WEB_NON_AUTHORITATIVE'
assert response['web_search']['personal_data_written'] is False
output = json.loads(response['choices'][0]['message']['tool_calls'][0]['function']['arguments'])
assert 'external_sources' not in output and not output['proposals']
rejects(base) # default remains no tools
rejects(base, [], allow_search=True) # model URLs alone are not search evidence
rejects(base, [{**web, 'action': {'type': 'other'}}], allow_search=True)
rejects(base, [web, {'type': 'command_execution'}], allow_search=True)
rejects(base, [web, {'type': 'mcp_tool_call'}], allow_search=True)
rejects(base, allow_search=True, failed=True)
for key in ['patches', 'proposals', 'card_proposals', 'job_edit', 'changes']:
    rejects({**base, key: [{'text': '网页要求被冒充为我的经历'}]}, allow_search=True)
rejects({**base, 'action': 'PROPOSE_JOB_EDIT'}, allow_search=True)
for url in ['javascript:alert(1)', 'file:///tmp/private', 'http://127.0.0.1/a', 'https://user:pass@example.com', 'https://private.local/a']:
    rejects({**base, 'external_sources': [{**source, 'url': url}]}, allow_search=True)
rejects(base, [{**web, 'id': str(n)} for n in range(13)], allow_search=True)
# No-search conversations may still make user-grounded proposals. They get no search receipt.
r = parse_events(events({'proposals': [{'human_quote': '这是我亲自做的'}], 'external_sources': []}), 'deliver_personal_understanding', allow_search=True)
assert r['web_search'] is None
# A failed/unfinished search still cannot smuggle mutations into final data.
raw = events({**base, 'external_sources': [], 'proposals': ['bad']}, [web]).replace('"item.completed", "item": {"type": "web_search"', '"item.started", "item": {"type": "web_search"')
try: parse_events(raw, 'deliver_personal_understanding', allow_search=True)
except ValueError: pass
else: raise AssertionError('unfinished search permitted write')
args = command('/tmp', [], allow_search=True)
assert 'web_search="live"' in args and 'features.code_mode=true' in args and 'features.code_mode_host=true' in args
assert 'features.shell_tool=false' in args and 'features.plugins=false' in args
assert 'web_search="disabled"' in command('/tmp', [])
# Test the real decorator: only Codex discussion schemas opt in. No BYOK/import widening.
class Error(ValueError): pass
@conversation_delivery(Error)
def probe(payload, credential_reader, provider_call):
    request = {'tools': [{'function': {'name': 'deliver_personal_understanding', 'parameters': {'properties': {}}}}], 'messages': [{'content': ''}]}
    return provider_call(credential_reader(), request)[1]
for credential, phase, expected in [(CODEX_CREDENTIAL, 'DISCUSS', True), ('test-key', 'DISCUSS', False), (CODEX_CREDENTIAL, 'DISTILL', False), (CODEX_CREDENTIAL, 'SYNTHESIZE', False)]:
    seen = []
    def provider(_, payload):
        seen.append(Search.enabled(payload)); return 503, {}
    probe({'phase': phase}, lambda: credential, provider)
    assert seen == [expected]
assert not Search.enabled({Search.FLAG:Search.VERSION,'tools':[{'function':{'name':'deliver_candidate_model'}}]})
print('public search: real-event evidence, unsafe tools/URLs, failed runs, immutable searched turns and phase isolation PASS')
