"""Discovery cannot grant visual eligibility or silently change model/effort."""
import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import codex_models as Models
from src.codex_runtime import call_codex, parse_events
from src.runtime_binding import CODEX_CREDENTIAL
from src.model_settings import envelope, validate


def row(model='gpt-6-luna', modalities=None, efforts=None):
    return {'model': model, 'displayName': model, 'inputModalities': modalities or ['text', 'image'],
            'defaultReasoningEffort': 'medium', 'supportedReasoningEfforts': [
                {'reasoningEffort': effort} for effort in (efforts or ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])]}


class ModelTests(unittest.TestCase):
    def test_discovery_is_not_qualification(self):
        found = Models.normalize_listing([None, row('future-model'), row('future-model'), {**row(), 'hidden': True}])
        self.assertEqual(len(found), 1)
        self.assertIsNone(Models.available_settings(found[0]))
        self.assertFalse(Models.qualified('future-model'))
        text_only = Models.normalize_listing([row(modalities=['text'])])[0]
        self.assertIsNone(Models.available_settings(text_only))

    def test_efforts_are_account_and_qualification_intersection(self):
        found = Models.normalize_listing([row(efforts=['high', 'ultra'])])[0]
        settings = Models.available_settings(found)
        self.assertEqual(settings['parameters']['reasoning_effort'], {
            'label': '推理强度', 'default': 'high', 'options': [{'value': 'high', 'label': '高'}]})
        with patch.object(Models, 'discover', return_value=[found]):
            Models.assert_available('gpt-6-luna', 'high')
            for model, effort in [('gpt-6-luna', 'low'), ('gpt-6-luna', 'ultra'), ('gpt-5.5', 'high')]:
                with self.assertRaises(ValueError): Models.assert_available(model, effort)

    def test_unavailable_never_falls_back_or_executes(self):
        with patch('src.codex_runtime.codex_enabled', return_value=True), patch.object(Models, 'discover', side_effect=TimeoutError), patch('src.codex_runtime._execute') as execute:
            with self.assertRaises(TimeoutError): call_codex(CODEX_CREDENTIAL, {'model': 'gpt-6-luna', 'reasoning_effort': 'max'})
            execute.assert_not_called()

    def test_all_qualified_models_preserve_requested_identity(self):
        for entry in Models.settings_entries():
            model = entry['model']
            for effort in [x['value'] for x in entry['parameters']['reasoning_effort']['options']]:
                value = envelope('codex', model, {'reasoning_effort': effort})
                validate(value, 'codex', model)
                payload = {'model': model, 'reasoning_effort': effort}
                with patch('src.codex_runtime.codex_enabled', return_value=True), patch.object(Models, 'assert_available'), patch('src.codex_runtime._execute', return_value=(200, {})) as execute:
                    call_codex(CODEX_CREDENTIAL, payload)
                    self.assertEqual(execute.call_args.args[0], payload)
            with self.assertRaises(ValueError): validate(envelope('codex', model, {'reasoning_effort': 'ultra'}), 'codex', model)

    def test_catalog_endpoint_fails_closed_without_private_data(self):
        from src.product_application import skill_handler
        class Base:
            def send_json(self, status, body): self.receipt = (status, body)
        handler = skill_handler(Base)()
        with patch('src.product_application.codex_enabled', return_value=True), patch.object(Models, 'discover', side_effect=TimeoutError):
            handler.runtime_options()
            self.assertEqual(handler.receipt[0], 503)
            self.assertEqual(handler.receipt[1]['models'], [])
        with patch('src.product_application.codex_enabled', return_value=True), patch.object(Models, 'discover', return_value=Models.normalize_listing([row(), row('future-model')])):
            handler.runtime_options()
            status, body = handler.receipt
            self.assertEqual(status, 200)
            self.assertFalse(body['career_data_sent'])
            self.assertEqual([x['model_id'] for x in body['models']], ['gpt-6-luna'])
            self.assertEqual(body['unavailable_models'][0]['model'], 'future-model')

    def test_public_result_retains_selected_model(self):
        raw = '\n'.join(json.dumps(x) for x in [
            {'type': 'thread.started', 'thread_id': 'synthetic'},
            {'type': 'item.completed', 'item': {'type': 'agent_message', 'text': '{"ok":true}'}},
            {'type': 'turn.completed', 'usage': {}}])
        self.assertEqual(parse_events(raw, None, model='gpt-6-luna')['model'], 'gpt-6-luna')


if __name__ == '__main__': unittest.main()
