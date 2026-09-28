"""Codex identity does not bypass any of the six existing domain contracts."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import runpy
import sys
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from src.runtime_binding import CODEX_MODEL,CODEX_PROTOCOL,CODEX_CREDENTIAL,adapter_for,resolve_runtime_credential
from src.candidate_model_runtime import candidate_model_operation_id,runtime_fingerprint
from src.job_model_runtime import job_model_operation_id
from src.codex_runtime import strict_schema,restore_optional_fields
from src.candidate_conversation_runtime import candidate_conversation_tool

def fixture(file):
    with contextlib.redirect_stdout(io.StringIO()):return runpy.run_path(str(ROOT/'tests'/file))

def convert(request, model=CODEX_MODEL):
    value=copy.deepcopy(request);runtime=value['runtime_snapshot']
    runtime.update(provider='codex',model=model,protocol=CODEX_PROTOCOL,credential_ref=CODEX_CREDENTIAL,adapter_version=adapter_for('codex',runtime['adapter_version']))
    from src.model_settings import envelope
    runtime['execution_settings'] = envelope('codex', model)
    if 'consent' in value:value['consent'].update(provider='codex',model=model)
    identity=value.get('operation_identity')
    if identity:
        fp=runtime_fingerprint(runtime);identity['runtime_fingerprint']=fp
        fn=candidate_model_operation_id if identity['operation_type']=='CANDIDATE_MODEL_STRUCTURING' else job_model_operation_id
        identity['operation_id']=fn(identity['source_document_id'],fp,identity['consent_id']);value['processing_run_id']='run-'+identity['operation_id']
    return value

cases=[]
for file,request_name,validate_name in [
    ('candidate_model_runtime_regression.py','request','validate_candidate_model_request'),
    ('job_model_import_regression.py','request','validate_job_model_request'),
    ('candidate_conversation_runtime_regression.py','request_for','validate_candidate_conversation_request'),
    ('job_conversation_runtime_regression.py','request','validate_job_conversation_request'),
    ('personal_understanding_runtime_regression.py','request','validate_request'),
    ('job_overview_runtime_regression.py','request','validate_request'),
]:
    f=fixture(file)
    if validate_name not in f:
        from src.candidate_model_runtime import validate_candidate_model_request
        f[validate_name]=validate_candidate_model_request
    request=f[request_name]() if callable(f[request_name]) else f[request_name]
    cases.append((file,convert(request),f[validate_name]))
with patch.dict(os.environ,{'ARIADNE_CODEX_ENABLED':'1'}):
    for name,value,validate in cases:
        validate(value)
        for key,bad in [('provider','deepseek'),('model','deepseek-v4-pro'),('model','gpt-unknown'),('protocol','OPENAI_CHAT_COMPLETIONS'),('adapter_version','unverified'),('credential_ref','keychain://AI-Learning-OS.JobRadar.DeepSeek/local-vision')]:
            invalid=copy.deepcopy(value);invalid['runtime_snapshot'][key]=bad
            try:validate(invalid)
            except ValueError:pass
            else:raise AssertionError((name,key,'unsafe runtime accepted'))
    from src.codex_models import settings_entries
    for entry in settings_entries():
        for name, value, validate in cases:
            validate(convert(value, entry['model']))
    assert resolve_runtime_credential(CODEX_CREDENTIAL,'unused',lambda:(_ for _ in ()).throw(AssertionError('credential read')))==CODEX_CREDENTIAL
# Every domain transports each accepted effort, before response handling.
from src.candidate_model_runtime import execute_candidate_model_request
from src.job_model_runtime import execute_job_model_request
from src.candidate_conversation_runtime import execute_candidate_conversation_request
from src.job_conversation_runtime import execute_job_conversation_request
from src.personal_understanding_runtime import execute as execute_personal
from src.job_overview_runtime import execute as execute_overview
class Captured(Exception): pass
executors = [execute_candidate_model_request, execute_job_model_request, execute_candidate_conversation_request, execute_job_conversation_request, execute_personal, execute_overview]
with patch.dict(os.environ,{'ARIADNE_CODEX_ENABLED':'1'}):
    for (name, original, validate), execute in zip(cases, executors):
        for effort in ('low', 'medium', 'high'):
            value = copy.deepcopy(original)
            value['runtime_snapshot']['execution_settings']['effective_settings']['reasoning_effort'] = effort
            identity = value.get('operation_identity')
            if identity:
                fp = runtime_fingerprint(value['runtime_snapshot']); identity['runtime_fingerprint'] = fp
                fn = candidate_model_operation_id if identity['operation_type'] == 'CANDIDATE_MODEL_STRUCTURING' else job_model_operation_id
                identity['operation_id'] = fn(identity['source_document_id'], fp, identity['consent_id']); value['processing_run_id'] = 'run-' + identity['operation_id']
            def provider(credential, payload):
                assert credential == CODEX_CREDENTIAL and payload['reasoning_effort'] == effort and payload['model'] == CODEX_MODEL
                raise Captured()
            try:
                if execute is execute_candidate_model_request:
                    execute(value, lambda: None, lambda _: [('1', b'synthetic-image')], provider)
                else: execute(value, lambda: None, provider)
            except Captured: pass
            else: raise AssertionError((name, effort, 'provider boundary not reached'))
        old = copy.deepcopy(original); old['runtime_snapshot'].pop('execution_settings')
        try: validate(old)
        except ValueError: pass
        else: raise AssertionError((name, 'legacy request executed'))
with patch.dict(os.environ,{'ARIADNE_CODEX_ENABLED':'0'}):
    for name,value,validate in cases:
        try:validate(value)
        except ValueError:pass
        else:raise AssertionError((name,'disabled Codex accepted'))
schema=candidate_conversation_tool()['function']['parameters'];original=copy.deepcopy(schema);strict=strict_schema(schema);assert schema==original
change=strict['properties']['patches']['anyOf'][0]['items']['properties']['changes']['items'];assert set(change['required'])==set(change['properties'])
value={'message':'请审阅','patches':[{'card_ref':None,'changes':[{'intent':'CLEAR','concept':'role_title','value':None,'selector':None}]}],'clarification':None}
restored=restore_optional_fields(value,schema);assert restored['patches'][0]['changes'][0]=={'intent':'CLEAR','concept':'role_title'};assert 'card_ref' not in restored['patches'][0]
print(json.dumps({'six_domain_identity_gates':'pass','disabled_unknown_text_only_rejected':'pass','credentials_not_read':'pass','optional_output_roundtrip':'pass','live_provider_calls':0}))

# A malformed local opt-in must fail closed, including valid JSON of the wrong type.
from src.runtime_binding import codex_enabled, local_runtime_preference
with patch.dict(os.environ, {}, clear=True):
    for raw in ['null', '[]', '"enabled"', '{invalid']:
        with patch.object(Path, 'read_text', return_value=raw):
            assert not codex_enabled() and local_runtime_preference() is None
