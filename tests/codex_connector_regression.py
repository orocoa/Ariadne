"""Loopback pairing, route isolation and Codex transport failure boundaries."""
import base64
import copy
import contextlib
import hashlib
import http.client
import io
import json
import os
import runpy
from pathlib import Path
import sys
import subprocess
import tempfile
import threading
from http.server import ThreadingHTTPServer
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.codex_runtime import command, isolated_environment, parse_events, prepare_input, call_codex
from src.runtime_binding import CODEX_MODEL, CODEX_CREDENTIAL, CODEX_PROTOCOL, valid_binding
from src.local_connector import Pairing, connector_handler
import app

clock = [0]
pairing = Pairing('https://web.example.test', 'test-code', clock=lambda: clock[0])
for bad in ['https://web.example.test/path', 'http://evil.test', 'https://u:p@web.example.test']:
    try: Pairing(bad)
    except ValueError: pass
    else: raise AssertionError('unsafe origin accepted')
server = ThreadingHTTPServer(('127.0.0.1', 0), connector_handler(app.JobRadarHandler));server.pairing = pairing
thread = threading.Thread(target=server.serve_forever, daemon=True);thread.start()
origin = pairing.origin

def request_http(method, path, body=None, *, token=None, site=origin, host=None):
    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=4)
    headers = {'Origin': site, 'Content-Type': 'application/json'}
    if token: headers['X-Ariadne-Connector'] = token
    if host: headers['Host'] = host
    if method == 'OPTIONS': headers.update({'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-ariadne-connector','Access-Control-Request-Private-Network':'true'})
    connection.request(method,path,None if body is None else json.dumps(body),headers)
    response=connection.getresponse();raw=response.read();value=json.loads(raw) if raw else {};status=response.status;headers=dict(response.getheaders());connection.close()
    return status,value,headers

try:
    assert request_http('GET','/api/runtime-options')[0]==401
    assert request_http('POST','/api/connector/pair',{'code':'test-code'},site='https://evil.test')[0]==403
    assert request_http('POST','/api/connector/pair',{'code':'test-code'},host='evil.test')[0]==403
    status,_,headers=request_http('OPTIONS','/api/connector/pair');assert status==204 and headers['Access-Control-Allow-Origin']==origin and headers['Access-Control-Allow-Private-Network']=='true'
    assert request_http('OPTIONS','/api/local-vision-config')[0]==404
    assert request_http('POST','/api/connector/pair',{'code':'wrong'})[0]==400
    status,body,_=request_http('POST','/api/connector/pair',{'code':'test-code'});assert status==200;token=body['token']
    assert pairing.token_hash and token not in repr(pairing.__dict__)
    assert request_http('POST','/api/connector/pair',{'code':'test-code'})[0]==400
    status,body,_=request_http('GET','/api/runtime-options',token=token);assert status==200 and [m['provider_id'] for m in body['models']]==['codex']
    assert request_http('GET','/api/runtime-options?token='+token,token=token)[0]==403
    for path in ['/api/local-vision-config','/api/jobs','/api/source-link-import','/api/ai-career-ingestion-config','/etc/passwd','/']:
        assert request_http('GET',path,token=token)[0]==404
    for provider in ['deepseek','gemini',None]:
        assert request_http('POST','/api/personal-understanding-turn',{'runtime_snapshot':{'mode':'model','provider':provider}},token=token)[0]==400
    for malformed in [[], None, {'runtime_snapshot': None}, {'runtime_snapshot': 'codex'}]:
        assert request_http('POST','/api/personal-understanding-turn',malformed,token=token)[0]==400
    with patch.object(app,'execute_personal_understanding',return_value={'persistence':'not_written','provider':'codex'}) as execute:
        status,body,_=request_http('POST','/api/personal-understanding-turn',{'runtime_snapshot':{'mode':'model','provider':'codex'}},token=token)
        assert status==200 and body['persistence']=='not_written' and execute.call_count==1
    # The Skill path reads original images/PDFs without Apple OCR or persisted data.
    with contextlib.redirect_stdout(io.StringIO()):
        fixture = runpy.run_path(str(ROOT / 'tests/candidate_model_runtime_regression.py'))
    snapshot = fixture['request']()['runtime_snapshot']
    image = (ROOT / 'public/job-radar-multimodal-smoke.jpg').read_bytes()
    value = {'runtime_snapshot': snapshot, 'material_type': 'CANDIDATE',
             'source_document_id': 'source-candidate-synthetic', 'media_type': 'image/jpeg',
             'expected_content_hash': 'sha256:' + hashlib.sha256(image).hexdigest(),
             'image_data_url': 'data:image/jpeg;base64,' + base64.b64encode(image).decode()}
    with patch.object(app, 'run_apple_vision_ocr', side_effect=AssertionError('Apple OCR called')):
        status, body, _ = request_http('POST', '/api/local-source-read', value, token=token)
        assert status == 200 and body['extraction_method'] == 'original_image_manifest_v1'
        assert body['writeback'] is False and body['model_call_made'] is False
    from src.model_updates import synthetic_pdf
    pdf = synthetic_pdf()
    value.update(media_type='application/pdf', expected_content_hash='sha256:' + hashlib.sha256(pdf).hexdigest(),
                 document_data_url='data:application/pdf;base64,' + base64.b64encode(pdf).decode())
    value.pop('image_data_url')
    with patch('src.web_source_read.inspect_complete_pdf', return_value=2):
        status, body, _ = request_http('POST', '/api/local-source-read', value, token=token)
        assert status == 200 and body['visual_page_count'] == 2 and body['extracted_text'] == ''
    value['expected_content_hash'] = 'sha256:incorrect'
    with patch('src.web_source_read.inspect_complete_pdf', side_effect=AssertionError('tampered original inspected')):
        assert request_http('POST', '/api/local-source-read', value, token=token)[0] == 422
    assert request_http('POST','/api/connector/revoke',token=token)[0]==200
    assert request_http('GET','/api/runtime-options',token=token)[0]==401
finally:
    server.shutdown();server.server_close()

p=Pairing(origin,'abc',clock=lambda:clock[0]);clock[0]=301
try:p.pair('abc')
except ValueError:pass
else:raise AssertionError('expired pairing accepted')
p=Pairing(origin,'abc',clock=lambda:clock[0]);token=p.pair('abc');clock[0]+=28801;assert not p.authorized(token)
with tempfile.TemporaryDirectory() as d:
    payload={'model':CODEX_MODEL,'reasoning_effort':'medium','messages':[{'role':'user','content':[{'type':'text','text':'page 1'},{'type':'image_url','image_url':{'url':'data:image/jpeg;base64,'+base64.b64encode(b'image1').decode()}},{'type':'text','text':'page 2'},{'type':'image_url','image_url':{'url':'data:image/jpeg;base64,'+base64.b64encode(b'image2').decode()}}]}]}
    prompt,images,schema,name=prepare_input(payload,Path(d));assert [p.read_bytes() for p in images]==[b'image1',b'image2'];assert prompt.index('page 1')<prompt.index('page 2')
    args=command(d,images);assert args.count('--image')==2 and '--ignore-user-config' in args and '--ephemeral' in args and 'read-only' in args
    assert 'features.shell_tool=false' in args and 'tools.view_image=false' in args and 'features.plugins=false' in args
    payload['messages'][0]['content'][1]['image_url']['url']='https://evil.test/image'
    try:prepare_input(payload,Path(d))
    except ValueError:pass
    else:raise AssertionError('remote image URL accepted')
with patch.dict(os.environ,{'CODEX_APP_TOOLS_PIPE_PATH':'private','CODEX_PERMISSION_PROFILE':'private','OPENAI_API_KEY':'private'}):
    clean=isolated_environment();assert not any(k in clean for k in ['CODEX_APP_TOOLS_PIPE_PATH','CODEX_PERMISSION_PROFILE','OPENAI_API_KEY'])
events=[{'type':'thread.started','thread_id':'synthetic'},{'type':'item.completed','item':{'type':'agent_message','text':'{"message":"ok"}'}},{'type':'turn.completed','usage':{'input_tokens':10,'output_tokens':3}}]
def raw(events):return '\n'.join(json.dumps(e) for e in events)
r=parse_events(raw(events),'deliver_test');assert r['model']==CODEX_MODEL and r['choices'][0]['message']['tool_calls'][0]['function']['name']=='deliver_test'
for bad in [events[:-1],events+[{'type':'turn.failed'}],events+[{'type':'item.completed','item':{'type':'command_execution'}}]]:
    try:parse_events(raw(bad),None)
    except ValueError:pass
    else:raise AssertionError('unsafe or incomplete event stream accepted')
with patch.dict(os.environ,{'ARIADNE_CODEX_ENABLED':'0'}),patch('src.codex_runtime.subprocess.Popen') as process:
    try:call_codex(CODEX_CREDENTIAL,{'model':CODEX_MODEL})
    except ValueError:pass
    else:raise AssertionError('disabled runtime executed')
    process.assert_not_called()
print(json.dumps({'pairing_origin_host_expiry_revoke':'pass','route_and_provider_allowlist':'pass','ordered_image_delivery':'pass','isolated_cli_and_incomplete_output':'pass','live_provider_calls':0}))

# Actual child-process failures and timeout cleanup, with no provider involved.
with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,{'ARIADNE_CODEX_ENABLED':'1'}):
    script=Path(directory)/'fake.py';payload={'model':CODEX_MODEL,'reasoning_effort':'medium','messages':[{'role':'user','content':'synthetic'}]}
    real_popen = subprocess.Popen
    def fake_child(_args, **kwargs): return real_popen([sys.executable, str(script)], **kwargs)
    script.write_text('import time\ntime.sleep(30)\n')
    with patch('src.codex_app_server.subprocess.Popen',side_effect=fake_child):
        try:call_codex(CODEX_CREDENTIAL,payload,timeout=0.05)
        except TimeoutError:pass
        else:raise AssertionError('timeout accepted')
    script.write_text('raise SystemExit(1)\n')
    with patch('src.codex_app_server.subprocess.Popen',side_effect=fake_child):
        try:call_codex(CODEX_CREDENTIAL,payload,timeout=2)
        except ValueError as error:assert str(error)=='CODEX_STREAM_INCOMPLETE'
        else:raise AssertionError('failed child accepted')
print(json.dumps({'child_failure_timeout_cleanup':'pass','live_provider_calls':0}))
