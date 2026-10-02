"""Codex discovery describes availability; reviewed visual checks grant eligibility."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import shutil
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
QUALIFICATIONS = json.loads((ROOT / 'data/codex_model_qualifications.json').read_text())
EFFORT_LABELS = {'low': '低', 'medium': '中', 'high': '高', 'xhigh': '超高', 'max': '最高'}
_lock = threading.Lock()
_cache = None
_checked = 0
_identity = None


def account_identity(account):
    """Hash public account metadata; never open credential files."""
    if not isinstance(account, dict) or account.get('type') != 'chatgpt' or not account.get('email'):
        return None
    fields = {key: account.get(key) for key in ('type', 'email', 'planType', 'id', 'accountId')}
    return hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()


def identity_for_account(account):
    from src.codex_runtime import codex_binary
    identity = account_identity(account)
    if not identity: return None
    path = Path(shutil.which(codex_binary()) or codex_binary()).resolve()
    stat = path.stat()
    binary = hashlib.sha256(f'{path}:{stat.st_size}:{stat.st_mtime_ns}'.encode()).hexdigest()
    return {'account': identity, 'binary': binary}


def discovery_identity():
    return copy.deepcopy(_identity)


def qualification_records():
    if not _identity: return QUALIFICATIONS['models']
    from src.codex_verification import service
    return {**QUALIFICATIONS['models'], **service().records()}


def qualified(model):
    value = qualification_records().get(model, {})
    return value.get('status') == 'VERIFIED' and value.get('adapter') == 'codex-bounded-app-server-v1'


def settings_entries():
    entries = []
    for model, record in qualification_records().items():
        if record.get('status') != 'VERIFIED' or record.get('adapter') != 'codex-bounded-app-server-v1': continue
        legacy = model == 'gpt-5.6-sol'
        entries.append({'provider': 'codex', 'model': model, 'protocol': 'CODEX_APP_SERVER',
            'short_label': record['display_name'], 'compact_label': record['display_name'],
            'connection_id': 'local-codex-v1',
            'descriptor_revision': record.get('descriptor_revision') or ('codex-sol-20260910' if legacy else 'codex-models-20260928-' + model),
            'settings_schema_version': 'codex-effort-v1', 'qualification': record.get('check_version', QUALIFICATIONS['check_version']),
            'parameters': {'reasoning_effort': {'label': '推理强度',
                'default': 'medium' if legacy else record['default_effort'],
                'options': [{'value': effort, 'label': EFFORT_LABELS[effort]} for effort in record['efforts'] if effort in EFFORT_LABELS]}}})
    return entries


def normalize_listing(rows):
    result, seen = [], set()
    for row in rows:
        if not isinstance(row, dict): continue
        model = row.get('model')
        if not isinstance(model, str) or not model or len(model) > 120 or model in seen or row.get('hidden'): continue
        efforts = [item.get('reasoningEffort') for item in row.get('supportedReasoningEfforts', []) if isinstance(item, dict)]
        if not efforts or not isinstance(row.get('inputModalities'), list): continue
        result.append({'model': model, 'display_name': str(row.get('displayName') or model)[:120],
            'efforts': list(dict.fromkeys(e for e in efforts if e in EFFORT_LABELS)),
            'default_effort': row.get('defaultReasoningEffort'), 'input_modalities': row['inputModalities'],
            'unsupported_efforts': [e for e in efforts if isinstance(e, str) and e not in EFFORT_LABELS]})
        seen.add(model)
    return result


def discover(force=False):
    global _cache, _checked, _identity
    with _lock:
        if not force and _cache is not None and time.monotonic() - _checked < 300: return copy.deepcopy(_cache)
        from src.codex_runtime import codex_binary, DISABLED_FEATURES
        from src.codex_app_server import Channel
        from src.codex_account import environment
        with tempfile.TemporaryDirectory(prefix='ariadne-model-list-') as directory:
            args = [codex_binary(), 'app-server', '--stdio']
            for feature in DISABLED_FEATURES: args += ['-c', f'features.{feature}=false']
            process = subprocess.Popen(args, cwd=directory, env=environment(), stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
            try:
                channel = Channel(process, 20)
                channel.request('initialize', {'clientInfo': {'name': 'ariadne-models', 'version': '1'}, 'capabilities': {'experimentalApi': True}})
                channel.send({'method': 'initialized'})
                try:
                    identity = identity_for_account(channel.request('account/read', {'refreshToken': False}).get('account'))
                except (ValueError, OSError, KeyError):
                    identity = None
                rows, cursor = [], None
                for _ in range(5):
                    response = channel.request('model/list', {'limit': 100, 'includeHidden': False, **({'cursor': cursor} if cursor else {})})
                    rows.extend(response['data']); cursor = response.get('nextCursor')
                    if not cursor: break
                if cursor: raise ValueError('CODEX_MODEL_LIST_LIMIT')
                result = normalize_listing(rows)
                if not result: raise ValueError('CODEX_MODEL_LIST_EMPTY')
                _cache, _checked, _identity = result, time.monotonic(), identity
                return copy.deepcopy(result)
            finally:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
                process.stdin.close(); process.stdout.close()


def available_settings(row):
    entry = next((x for x in settings_entries() if x['model'] == row['model']), None)
    if not entry or not {'text', 'image'} <= set(row['input_modalities']): return None
    spec = entry['parameters']['reasoning_effort']
    spec['options'] = [x for x in spec['options'] if x['value'] in row['efforts']]
    if not spec['options']: return None
    if spec['default'] not in [x['value'] for x in spec['options']]: spec['default'] = spec['options'][0]['value']
    entry['short_label'] = entry['compact_label'] = row['display_name']
    return entry


def assert_available(model, effort):
    rows = discover(force=True) if model not in QUALIFICATIONS['models'] else discover()
    row = next((x for x in rows if x['model'] == model), None)
    if not qualified(model): raise ValueError('CODEX_MODEL_NOT_QUALIFIED')
    entry = available_settings(row) if row else None
    if not entry or effort not in [x['value'] for x in entry['parameters']['reasoning_effort']['options']]:
        raise ValueError('CODEX_MODEL_OR_EFFORT_UNAVAILABLE')
