"""Automatic, bounded synthetic qualification for newly discovered Codex models.

Records live outside the installation. Discovery alone never grants eligibility.
No credentials, career data, client prompts or client images enter this worker.
"""
import base64
from contextlib import contextmanager
import fcntl
from functools import lru_cache
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import sys
import tempfile
import threading
import time

CHECK_VERSION = 'codex-image-complete-pdf-json-isolation-v1'
ADAPTER = 'codex-bounded-app-server-v1'
TIMEOUT = 180
DAILY_LIMIT = 3
MESSAGES = {
    'PENDING': '等待验证', 'RUNNING': '正在验证图片与完整 PDF…',
    'VERIFIED': '验证通过', 'FAILED': '验证未通过，可手动重试',
    'INTERRUPTED': '验证已中断，可手动重试',
    'CODEX_TIMEOUT': '验证超时，可稍后重试',
    'CODEX_BUSY': 'Codex 正忙，可稍后重试',
    'pdf_preflight_failed': '无法检查 PDF，请检查 Poppler 安装',
    'pdf_page_render_failed': '无法完整转换 PDF，请检查 Poppler 安装',
    'VISUAL_RESULT_MISMATCH': '图片或 PDF 读取结果未通过核对',
    'ACCOUNT_CHANGED': '账号或 Codex 版本已变化，请重新验证',
    'CODEX_ISOLATION_NOT_CONFIRMED': '无法确认模型执行权限隔离',
    'EXECUTION_CANCELLED': '验证已停止',
}


def state_directory():
    workspace = os.environ.get('ARIADNE_WORKSPACE_ROOT')
    if workspace: return Path(workspace).parent / 'model-verification'
    base = Path.home() / ('Library/Application Support' if sys.platform == 'darwin' else '.local/share')
    return base / 'Ariadne Skill' / 'model-verification'


@lru_cache(maxsize=1)
def adapter_fingerprint():
    # Loaded code changes only after restart; avoid rereading source on each menu poll.
    root = Path(__file__).parent
    digest = hashlib.sha256(CHECK_VERSION.encode())
    for name in ('codex_runtime.py', 'codex_app_server.py', 'pdf_delivery.py', 'codex_verification.py'):
        digest.update((root / name).read_bytes())
    return digest.hexdigest()


def context():
    from src.codex_models import discovery_identity
    identity = discovery_identity()
    return {**identity, 'adapter': adapter_fingerprint()} if identity else None


def key_for(ctx, model):
    return hashlib.sha256(json.dumps([ctx, model], sort_keys=True).encode()).hexdigest()


def eligible(row):
    return {'text', 'image'} <= set(row.get('input_modalities', [])) and bool(row.get('efforts'))


def start_worker(target, args):
    threading.Thread(target=target, args=args, daemon=True).start()


def probe(row, ctx):
    from src.codex_runtime import _execute
    from src.model_updates import synthetic_pdf
    from src.pdf_delivery import render_complete_pdf_pages
    from src.runtime_cancellation import check_cancelled
    # Answers exist only in pixels, never in the prompt, file names or schema.
    readings = ['ARIADNE ' + secrets.token_hex(4).upper() for _ in range(3)]
    standalone = render_complete_pdf_pages(synthetic_pdf((readings[0],)))
    pdf = synthetic_pdf(tuple(readings[1:]))
    pages = render_complete_pdf_pages(pdf)
    if [number for number, _ in standalone] != ['1'] or [number for number, _ in pages] != ['1', '2']:
        raise ValueError('pdf_page_render_failed')
    images = [standalone[0][1]] + [data for _, data in pages]
    effort = 'low' if 'low' in row['efforts'] else row['efforts'][0]
    payload = {'model': row['model'], 'reasoning_effort': effort,
        '_verification_identity': {k: ctx[k] for k in ('account', 'binary')},
        'messages': [{'role': 'user', 'content': [
            {'type': 'text', 'text': 'Read the exact text in the three images in order. The first is an image, followed by every page of a two-page PDF. Return readings in order. Do not use tools or infer unseen text.'},
            *[{'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + base64.b64encode(data).decode()}} for data in images]]}],
        'tools': [{'type': 'function', 'function': {'name': 'verify_visual_reading', 'parameters': {
            'type': 'object', 'properties': {'readings': {'type': 'array', 'items': {'type': 'string'}}},
            'required': ['readings'], 'additionalProperties': False}}}]}
    check_cancelled()
    status, result = _execute(payload, TIMEOUT)
    try:
        calls = result['choices'][0]['message']['tool_calls']
        valid = (status == 200 and result['model'] == row['model'] and len(calls) == 1
                 and calls[0]['function']['name'] == 'verify_visual_reading'
                 and json.loads(calls[0]['function']['arguments']) == {'readings': readings})
    except (KeyError, TypeError, IndexError, ValueError): valid = False
    if not valid: raise ValueError('VISUAL_RESULT_MISMATCH')
    return {'status': 'VERIFIED', 'adapter': ADAPTER, 'check_version': CHECK_VERSION,
            'display_name': row['display_name'], 'default_effort': effort, 'efforts': row['efforts'],
            'verified_effort': effort, 'image_sha256': hashlib.sha256(images[0]).hexdigest(),
            'pdf_sha256': hashlib.sha256(pdf).hexdigest(), 'pages': 2,
            'usage': {k: v for k, v in result.get('usage', {}).items() if k in ('prompt_tokens', 'completion_tokens', 'total_tokens') and isinstance(v, int)}}


class Verification:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.lock = threading.RLock()
        self.jobs = {}

    @contextmanager
    def state(self):
        with self.lock:
            self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            target = self.directory / 'state.json'
            lockpath = self.directory / 'state.lock'
            if self.directory.is_symlink() or target.is_symlink() or lockpath.is_symlink():
                raise ValueError('VERIFICATION_STATE_INVALID')
            with lockpath.open('a+') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                if target.exists() and target.stat().st_size > 1_000_000: raise ValueError('VERIFICATION_STATE_INVALID')
                data = json.loads(target.read_text()) if target.exists() else {'records': {}, 'attempts': []}
                if not isinstance(data, dict) or not isinstance(data.get('records'), dict) or not isinstance(data.get('attempts'), list):
                    raise ValueError('VERIFICATION_STATE_INVALID')
                if (any(not isinstance(r, dict) or not isinstance(r.get('model'), str) or not isinstance(r.get('started'), (int, float)) for r in data['records'].values())
                        or any(type(t) not in (int, float) or not math.isfinite(t) for t in data['attempts'])):
                    raise ValueError('VERIFICATION_STATE_INVALID')
                before = json.dumps(data, sort_keys=True)
                yield data
                if json.dumps(data, sort_keys=True) != before:
                    with tempfile.NamedTemporaryFile(mode='w', dir=self.directory, delete=False) as out:
                        json.dump(data, out); out.flush(); os.fsync(out.fileno())
                    os.replace(out.name, target)

    def records(self):
        from src.codex_models import EFFORT_LABELS
        ctx = context()
        if not ctx or not (self.directory / 'state.json').exists(): return {}
        try:
            with self.state() as data:
                return {record['model']: {**record, 'descriptor_revision': 'codex-verified-' + key}
                        for key, record in data['records'].items()
                        if record.get('context') == ctx and record.get('status') == 'VERIFIED'
                        and key == key_for(ctx, record.get('model')) and record.get('check_version') == CHECK_VERSION
                        and record.get('adapter') == ADAPTER
                        and isinstance(record.get('display_name'), str)
                        and isinstance(record.get('efforts'), list) and record['efforts']
                        and all(isinstance(e, str) and e in EFFORT_LABELS for e in record['efforts'])
                        and record.get('default_effort') in record['efforts']}
        except (OSError, ValueError, TypeError, KeyError): return {}

    def configure(self, body, rows):
        from src.codex_models import QUALIFICATIONS
        ctx = context()
        if not ctx: raise ValueError('VERIFICATION_ACCOUNT_REQUIRED')
        if set(body) != {'retry'}: raise ValueError('VERIFICATION_REQUEST_INVALID')
        row = next((x for x in rows if x['model'] == body['retry']), None)
        if not row or not eligible(row) or row['model'] in QUALIFICATIONS['models']: raise ValueError('VERIFICATION_MODEL_INVALID')
        with self.state() as data:
            record = data['records'].get(key_for(ctx, row['model']))
            if not record or record.get('status') not in ('FAILED', 'INTERRUPTED'): raise ValueError('VERIFICATION_RETRY_INVALID')
            record['status'] = 'PENDING'
        return self.refresh(rows)

    def refresh(self, rows):
        from src.codex_models import QUALIFICATIONS
        ctx = context()
        if not ctx: return {'available': False, 'active': False, 'models': {}, 'message': '请先确认 Ariadne Codex 已登录'}
        now = time.time()
        with self.state() as data:
            data['attempts'] = [stamp for stamp in data['attempts'] if now - stamp < 86400]
            for record in data['records'].values():
                if record.get('status') == 'RUNNING' and now - record.get('started', 0) > TIMEOUT + 180:
                    record['status'] = 'INTERRUPTED'
            remaining = max(0, DAILY_LIMIT - len(data['attempts']))
            running = any(r.get('status') == 'RUNNING' for r in data['records'].values())
            states = {}
            for row in rows:
                model = row['model']
                if model in QUALIFICATIONS['models']: continue
                key = key_for(ctx, model)
                record = data['records'].get(key, {})
                status = record.get('status', 'PENDING')
                if eligible(row) and status == 'PENDING' and remaining and not running and len(data['records']) < 256:
                    from src.runtime_cancellation import Cancellation
                    cancellation = Cancellation()
                    attempt = secrets.token_hex(16)
                    self.jobs[attempt] = cancellation
                    data['records'][key] = {'model': model, 'context': ctx, 'status': 'RUNNING', 'started': now, 'attempt': attempt}
                    record = data['records'][key]
                    data['attempts'].append(now)
                    remaining -= 1; running = True; status = 'RUNNING'
                    start_worker(target=self.run, args=(row.copy(), ctx, key, attempt, cancellation))
                reason = MESSAGES.get(record.get('error'), MESSAGES.get(status, '等待验证'))
                if not eligible(row): reason = '该型号未声明图片输入或受支持的推理强度'
                states[model] = {'status': status, 'reason': reason,
                                 'can_retry': eligible(row) and status in ('FAILED', 'INTERRUPTED') and remaining > 0}
            active = any(x['status'] == 'RUNNING' for x in states.values())
            message = '新型号会自动用合成图片和完整 PDF 验证；每 24 小时最多 3 次，使用少量 Codex 额度，不发送个人资料或切换模型。'
            if not remaining: message = '已达到 24 小时内 3 次验证上限；当前验证会继续完成。'
            return {'available': True, 'active': active, 'models': states, 'message': message}

    def run(self, row, ctx, key, attempt, cancellation):
        from src import codex_models as Models
        from src.codex_runtime import EXECUTION_SLOTS
        from src.runtime_cancellation import CANCEL
        token = CANCEL.set(cancellation)
        acquired = False
        rows = []
        try:
            cancellation.check()
            rows = Models.discover(force=True)
            if context() != ctx or row not in rows: raise ValueError('ACCOUNT_CHANGED')
            cancellation.check()
            acquired = EXECUTION_SLOTS.acquire(blocking=False)
            if not acquired: raise ValueError('CODEX_BUSY')
            result = probe(row, ctx)
            cancellation.check()
            Models.discover(force=True)
            if context() != ctx: raise ValueError('ACCOUNT_CHANGED')
        except Exception as error:
            code = str(error)
            result = {'status': 'FAILED', 'error': code if code in MESSAGES else 'FAILED'}
        finally:
            if acquired: EXECUTION_SLOTS.release()
            CANCEL.reset(token)
        try:
            with self.state() as data:
                record = data['records'].get(key, {})
                if record.get('attempt') == attempt and record.get('status') == 'RUNNING':
                    record.update(result, finished=time.time())
        finally:
            with self.lock: self.jobs.pop(attempt, None)
        # Drain remaining discovered models even when the menu has closed.
        if rows and context() == ctx:
            self.refresh(rows)


_service = None
_service_lock = threading.Lock()


def service():
    global _service
    with _service_lock:
        path = state_directory()
        if _service is None or _service.directory != path: _service = Verification(path)
        return _service
