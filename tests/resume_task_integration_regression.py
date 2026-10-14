"""Synthetic-only tests of the existing four domain delivery entry points.

The substitutes are intentionally able to return a CV under generic PDF. The
test requires a semantic purpose call and subsequent factual review, rather than
assuming a prompt or schema prevents that actual counterexample.
"""
import base64
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import resume_task_runtime as Task
from src import resume_template_delivery as Template
from src import local_attachment_delivery as CurrentAttachment
from src.conversation_delivery import REVIEWED_VERSION, VERSION, conversation_delivery, domain_payload
from src.personal_understanding_runtime import execute as personal_execute

NODE = os.environ.get("ARIADNE_NODE_BINARY", "/Users/kai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node")


def read_fixture(name):
    # Existing suites are all offline and supply the real, domain-owned request
    # and response shapes. Their stdout does not become the fixture.
    with contextlib.redirect_stdout(io.StringIO()):
        return runpy.run_path(str(ROOT / "tests" / name))


def base_output(response):
    choice = response["choices"][0]
    if choice["finish_reason"] == "stop":
        return json.loads(choice["message"]["content"])
    return json.loads(choice["message"]["tool_calls"][0]["function"]["arguments"])


def seal(context):
    context["context_fingerprint"] = Task.context_fingerprint(context)
    return context


class Provider:
    def __init__(self, context, base, runtime_helpers, *, medium="intent", purpose=True,
                 review_status="READY", needs_facts=False, fail_tool=None,
                 purpose_output=None, purpose_model=None, purpose_tool=None):
        self.context, self.base = context, base
        self.medium, self.purpose = medium, purpose
        self.generation, self.review = runtime_helpers["outputs"](context)
        if needs_facts:
            self.generation = {"status": "NEEDS_FACTS", "message": "What name should appear in the resume?", "deliverable": None, "grounding": []}
        if review_status == "REVISION_REQUIRED":
            self.review.update(status=review_status, message="The proposed achievement conflicts with the latest correction.")
            self.review["checks"]["current_corrections"] = "BLOCK"
            self.review["block_reviews"][-1]["text"].update(status="CONTRADICTED", reason="Current correction rejects the proposed achievement.")
            self.review["issues"] = [{"kind": "REJECTED_CLAIM_RETURNED", "block_indexes": [5],
                "source_refs": self.generation["grounding"][5]["text_source_refs"], "explanation": "An old, withdrawn achievement must be removed.", "question": ""}]
        self.fail_tool = fail_tool
        self.purpose_output, self.purpose_model, self.purpose_tool = purpose_output, purpose_model, purpose_tool
        self.calls = []

    def __call__(self, credential, payload):
        self.calls.append(copy.deepcopy(payload))
        assert credential == "synthetic-key"
        name = payload["tools"][0]["function"]["name"]
        if name == self.fail_tool:
            return 503, {"error": {"message": "Synthetic failure"}}
        model, returned_tool = payload["model"], name
        if name == Task.GENERATION_TOOL:
            value = self.generation
        elif name == Task.REVIEW_TOOL:
            value = self.review
        elif name == Task.PURPOSE_TOOL:
            value = self.purpose_output if self.purpose_output is not None else {"is_resume": self.purpose}
            model = self.purpose_model or model
            returned_tool = self.purpose_tool or name
        else:
            value = copy.deepcopy(self.base)
            if self.medium == "intent":
                value["deliverable"] = {"kind": "RESUME_INTENT", "instruction": self.context["current_human"],
                    "template_name": (self.context.get("template") or {}).get("name", ""), "continue": bool(self.context["prior_task"])}
            elif self.medium == "pdf_cv":
                value["deliverable"] = {"kind": "PDF", "title": "Synthetic candidate application", "nodes": [], "edges": [],
                    "body": "Synthetic Name\nEducation\nSynthetic University, 2024-2025\nExperience\nDesigned 20 products and managed 8 suppliers."}
            elif self.medium == "pdf_report":
                value["deliverable"] = {"kind": "PDF", "title": "Evidence collection guide", "nodes": [], "edges": [],
                    "body": "A resume should explain responsibilities accurately. This is a report on collecting evidence, not a candidate CV."}
            elif self.medium == "unreviewed_resume":
                value["deliverable"] = self.generation["deliverable"]
            elif self.medium == "chat":
                value["deliverable"] = None
            else:
                raise AssertionError(self.medium)
        return 200, {"model": model, "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [
            {"function": {"name": returned_tool, "arguments": json.dumps(value, ensure_ascii=False)}}]}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}


class FourDomainDeliveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime_helpers = read_fixture("resume_task_runtime_regression.py")
        cls.frozen = cls.runtime_helpers["node_fixture"]()
        candidate = read_fixture("candidate_conversation_runtime_regression.py")
        job = read_fixture("job_conversation_runtime_regression.py")
        overview = read_fixture("job_overview_runtime_regression.py")
        personal = json.loads(subprocess.check_output([NODE, str(ROOT / "tests/personal_understanding_regression.mjs"), "--request"], text=True))
        cls.entries = {
            "CANDIDATE": (candidate["base_request"], candidate["execute_candidate_conversation_request"], base_output(candidate["valid_response"])),
            "JOB": (job["request"](), job["execute_job_conversation_request"], job["semantic"]()),
            "PERSONAL": (personal, personal_execute, {"message": "File will appear after review.", "proposals": [], "card_proposals": []}),
            "JOB_OVERVIEW": (overview["request"], overview["execute"], overview["output"]),
        }
        cls.candidate = candidate
        cls.job = job

    def case(self, domain, **options):
        request, execute, base = self.entries[domain]
        request, context = copy.deepcopy(request), copy.deepcopy(self.frozen["context"])
        request["human_message"] = context["current_human"]
        context["scope"]["domain"] = domain
        context["scope"]["conversation_id"] = request.get("conversation", {}).get("conversation_id") or domain
        context["task_id"] = "qa-integrated-task-" + domain
        context["consent"].update(provider=request["runtime_snapshot"]["provider"], model=request["runtime_snapshot"]["model"])
        if domain == "JOB":
            observed = request["observation"]
            context["job_context"] = {"binding": {"context_id": observed["job_context_id"], "revision_id": observed["job_revision_id"], "version": observed["job_revision_version"]},
                "content": copy.deepcopy(request["compiled_context"]["job"])}
        request["resume_context"] = seal(context)
        provider = Provider(context, base, self.runtime_helpers, **options)
        return request, execute, provider

    def run_case(self, domain, **options):
        request, execute, provider = self.case(domain, **options)
        with contextlib.redirect_stdout(io.StringIO()):
            result = execute(request, lambda: "synthetic-key", provider)
        return request, result, provider

    def test_actual_four_domains_generate_review_and_sum_three_calls(self):
        for domain in self.entries:
            with self.subTest(domain=domain):
                request, result, provider = self.run_case(domain)
                self.assertEqual(len(provider.calls), 3)
                self.assertEqual(result["resume_task"]["calls"], 2)
                self.assertEqual(result["delivery_version"], REVIEWED_VERSION)
                self.assertEqual(result["persistence"], "not_written")
                self.assertEqual(result["usage"], {"prompt_tokens": 30, "completion_tokens": 15, "total_tokens": 45})
                self.assertEqual(result["deliverable"], result["resume_task"]["deliverable"])
                self.assertEqual(result["resume_task"]["scope"], request["resume_context"]["scope"])
                if domain == "CANDIDATE":
                    self.assertNotIn("output", result, "Candidate keeps its domain-owned action result")
                    self.candidate["validate_candidate_action"](result["action"], self.candidate["validate_candidate_conversation_request"]({key: value for key, value in request.items() if key != "resume_context"}))
                    self.assertEqual(result["action"]["message"], result["resume_task"]["message"])
                elif domain == "JOB_OVERVIEW":
                    self.assertEqual(result["output"]["summary"], result["resume_task"]["message"])
                else:
                    self.assertEqual(result["output"]["message"], result["resume_task"]["message"])
                # The bounded first call gets only routing metadata. Both fact
                # calls get the original correction and every full record.
                for call in provider.calls[1:]:
                    self.assertIn("old claims about 20 products and 8 suppliers are withdrawn", json.dumps(call))
                    self.assertNotIn("ariadne_conversation_web_search", call)

    def test_nonobject_http_json_reaches_original_domain_shape_error_without_provider(self):
        import app
        for payload in (None, [], [{"resume_context": {"must": "remain in the invalid array"}}]):
            self.assertIs(domain_payload(payload), payload, "the delivery projection must preserve a nonobject for the original validator")
            for domain, method, expected in (("CANDIDATE", "run_candidate_conversation_turn", "EXACT_SCHEMA_FAILURE"),
                    ("JOB", "run_job_conversation_turn", "REQUEST_INVALID")):
                handler = object.__new__(app.JobRadarHandler)
                body = json.dumps(payload).encode()
                handler.web_request = True  # Never initialize a user's local attachment library.
                handler.headers = {"Content-Length": str(len(body))}
                handler.rfile = io.BytesIO(body)
                receipts, forbidden = [], []
                handler.send_json = lambda status, value: receipts.append((int(status), value))
                def unexpected(*args):
                    forbidden.append(args)
                    raise AssertionError("Invalid HTTP JSON must fail before credential, execution or provider setup")
                handler.runtime_api_key = unexpected; handler.execution_registry = unexpected
                with self.subTest(domain=domain, payload=payload), contextlib.redirect_stdout(io.StringIO()):
                    getattr(handler, method)()
                    self.assertEqual(len(receipts), 1)
                    self.assertEqual(receipts[0][0], 422)
                    self.assertEqual(receipts[0][1]["error"], expected)
                    self.assertFalse(receipts[0][1]["network_call_made"])
                    self.assertEqual(receipts[0][1]["persistence"], "not_written")
                    self.assertEqual(forbidden, [])

    def test_review_rejection_and_missing_facts_are_non_downloadable(self):
        for domain in self.entries:
            for options, expected_calls, expected_status in (({"review_status": "REVISION_REQUIRED"}, 3, "REVISION_REQUIRED"), ({"needs_facts": True}, 2, "NEEDS_FACTS")):
                with self.subTest(domain=domain, status=expected_status):
                    _, result, provider = self.run_case(domain, **options)
                    self.assertNotIn("deliverable", result)
                    self.assertIsNone(result["resume_task"]["deliverable"])
                    self.assertEqual(result["resume_task"]["status"], expected_status)
                    self.assertEqual(len(provider.calls), expected_calls)
                    self.assertEqual(result["usage"]["total_tokens"], 15 * expected_calls)

    def test_first_bounded_question_becomes_valid_explanation_after_full_review_ready(self):
        for domain in ("CANDIDATE", "JOB"):
            request, execute, provider = self.case(domain)
            question = "What name should appear in the final resume?"
            if domain == "CANDIDATE":
                provider.base = self.candidate["semantic_action"]("ASK_CLARIFICATION", [], clarification=question)
            else:
                provider.base = self.job["semantic"]("ASK_CLARIFICATION")
                provider.base["clarification"] = question
                provider.base["message"] = "The bounded first response needs a name."
            with contextlib.redirect_stdout(io.StringIO()): result = execute(request, lambda: "synthetic-key", provider)
            with self.subTest(domain=domain):
                output = result["action"] if domain == "CANDIDATE" else result["output"]
                self.assertEqual(result["resume_task"]["status"], "READY")
                self.assertEqual(output["action"], "EXPLAIN")
                self.assertIsNone(output["clarification"])
                self.assertEqual(output["message"], result["resume_task"]["message"])
                self.assertEqual(result["deliverable"], result["resume_task"]["deliverable"])
                self.assertEqual(len(provider.calls), 3)
                if domain == "CANDIDATE":
                    self.assertNotIn("output", result); self.assertEqual(output["patches"], [])
                    validated = self.candidate["validate_candidate_conversation_request"]({key: value for key, value in request.items() if key != "resume_context"})
                    self.candidate["validate_candidate_action"](output, validated)
                else:
                    self.assertEqual(output["changes"], [])
                    self.job["validate_semantic_output"](output, request["compiled_context"])

    def test_first_question_still_projects_the_actual_question_when_full_task_needs_facts(self):
        for domain in ("CANDIDATE", "JOB"):
            request, execute, provider = self.case(domain, needs_facts=True)
            if domain == "CANDIDATE":
                provider.base = self.candidate["semantic_action"]("ASK_CLARIFICATION", [], clarification="Which record did you mean?")
            else:
                provider.base = self.job["semantic"]("ASK_CLARIFICATION"); provider.base["clarification"] = "Which record did you mean?"
            with contextlib.redirect_stdout(io.StringIO()): result = execute(request, lambda: "synthetic-key", provider)
            with self.subTest(domain=domain):
                output = result["action"] if domain == "CANDIDATE" else result["output"]
                self.assertEqual(output["action"], "ASK_CLARIFICATION")
                self.assertEqual(output["clarification"], result["resume_task"]["message"])
                self.assertEqual(result["resume_task"]["status"], "NEEDS_FACTS")
                self.assertNotIn("deliverable", result); self.assertEqual(len(provider.calls), 2)

    def test_actual_domain_mutation_actions_never_start_resume_generation(self):
        for domain in ("CANDIDATE", "JOB"):
            for empty in (True, False):
                request, execute, provider = self.case(domain)
                if domain == "CANDIDATE":
                    provider.base = self.candidate["semantic_action"]("PATCH_ITEM", [] if empty else [self.candidate["semantic_patch"]("card-1", "institution_name", "Changed University")])
                else:
                    provider.base = self.job["semantic"]("PROPOSE_JOB_EDIT")
                    if empty: provider.base["changes"] = []
                with self.subTest(domain=domain, empty=empty), self.assertRaises(ValueError):
                    with contextlib.redirect_stdout(io.StringIO()): execute(request, lambda: "synthetic-key", provider)
                self.assertEqual(len(provider.calls), 1, "the real domain or shared readonly guard must stop before the writer")

    def test_readonly_guard_rejects_action_type_even_without_mutation_arrays(self):
        class BoundaryError(ValueError):
            def __init__(self, code, layer, network): super().__init__(code)
        # Independently exercise the shared guard after a domain boundary. This
        # isolate intentionally supplies action labels without any patch/change
        # data, which the original array-only condition could have overlooked.
        @conversation_delivery(BoundaryError)
        def boundary(request, credential_reader, provider_call):
            response = provider_call(credential_reader(), {"model": request["runtime_snapshot"]["model"],
                "messages": [{"role": "system", "content": "Synthetic domain boundary."}, {"role": "user", "content": request["human_message"]}],
                "tools": [{"type": "function", "function": {"name": "deliver_test_domain", "parameters": {"properties": {}}}}]})[1]
            function = response["choices"][0]["message"]["tool_calls"][0]["function"]
            return {"output": json.loads(function["arguments"]), "usage": {}, "persistence": "not_written"}
        for action in ("PATCH_ITEM", "PATCH_MULTIPLE_ITEMS", "PROPOSE_JOB_EDIT", "REMOVE_ITEM", "WRITE_DOCUMENT"):
            request, _, provider = self.case("PERSONAL")
            provider.base = {"action": action, "patches": [], "changes": []}
            with self.subTest(action=action), self.assertRaisesRegex(BoundaryError, "RESUME_TURN_MUTATION_FORBIDDEN"):
                boundary(request, lambda: "synthetic-key", provider)
            self.assertEqual(len(provider.calls), 1)

    def test_unreviewed_typed_resume_cannot_bypass_new_task_route(self):
        for domain in self.entries:
            for include_context in (True, False):
                request, execute, provider = self.case(domain, medium="unreviewed_resume")
                if not include_context: request.pop("resume_context")
                with self.subTest(domain=domain, include_context=include_context), self.assertRaises(ValueError):
                    execute(request, lambda: "synthetic-key", provider)
                self.assertEqual(len(provider.calls), 1)

    def test_omitting_context_never_disables_fresh_resume_review(self):
        for domain in self.entries:
            for medium, count in (("intent", 1), ("pdf_cv", 2)):
                request, execute, provider = self.case(domain, medium=medium)
                request.pop("resume_context")
                with self.subTest(domain=domain, medium=medium), self.assertRaisesRegex(ValueError, "RESUME_CONTEXT_REQUIRED"):
                    execute(request, lambda: "synthetic-key", provider)
                self.assertEqual(len(provider.calls), count)
            request, execute, provider = self.case(domain, medium="pdf_report", purpose=False)
            request.pop("resume_context")
            with contextlib.redirect_stdout(io.StringIO()): result = execute(request, lambda: "synthetic-key", provider)
            self.assertEqual(result["deliverable"]["kind"], "PDF"); self.assertEqual(len(provider.calls), 2)

    def test_generic_pdf_cv_counterexample_requires_purpose_and_factual_review(self):
        for domain in self.entries:
            with self.subTest(domain=domain):
                _, result, provider = self.run_case(domain, medium="pdf_cv", purpose=True)
                self.assertEqual(len(provider.calls), 4)
                self.assertEqual([p["tools"][0]["function"]["name"] for p in provider.calls[1:]], [Task.PURPOSE_TOOL, Task.GENERATION_TOOL, Task.REVIEW_TOOL])
                self.assertEqual(result["delivery_calls"], 1)
                self.assertEqual(result["usage"]["total_tokens"], 60)
                self.assertEqual(result["deliverable"]["kind"], "RESUME")
                self.assertNotIn("20 products", json.dumps(result["deliverable"]))
                self.assertNotIn("8 suppliers", json.dumps(result["deliverable"]))
                self.assertEqual(result["delivery_version"], REVIEWED_VERSION)
                self.assertIn("actual_generic_pdf", json.dumps(provider.calls[1]))
                self.assertIn("Designed 20 products", json.dumps(provider.calls[1]))

    def test_non_resume_pdf_keeps_report_after_semantic_purpose_review(self):
        for domain in self.entries:
            with self.subTest(domain=domain):
                _, result, provider = self.run_case(domain, medium="pdf_report", purpose=False)
                self.assertEqual(len(provider.calls), 2)
                self.assertEqual(result["deliverable"]["kind"], "PDF")
                self.assertEqual(result["delivery_version"], VERSION)
                self.assertNotIn("resume_task", result)
                self.assertEqual(result["usage"]["total_tokens"], 30)

    def test_purpose_or_generation_or_review_failure_never_returns_file(self):
        for domain in self.entries:
            for tool in (Task.PURPOSE_TOOL, Task.GENERATION_TOOL, Task.REVIEW_TOOL):
                request, execute, provider = self.case(domain, medium="pdf_cv", fail_tool=tool)
                with self.subTest(domain=domain, tool=tool), self.assertRaises(ValueError):
                    execute(request, lambda: "synthetic-key", provider)
                self.assertEqual(provider.calls[-1]["tools"][0]["function"]["name"], tool)

    def test_malformed_purpose_is_failure_not_an_assumed_report(self):
        for options in ({"purpose_output": {"is_resume": "false"}}, {"purpose_output": {"is_resume": False, "comment": "skip"}},
                        {"purpose_output": {}}, {"purpose_model": "wrong-test-model"}, {"purpose_tool": "unrequested-tool"}):
            request, execute, provider = self.case("PERSONAL", medium="pdf_cv", **options)
            with self.subTest(options=options), self.assertRaises(ValueError): execute(request, lambda: "synthetic-key", provider)
            self.assertEqual(len(provider.calls), 2)

    def test_unavailable_complete_context_fails_resume_but_still_allows_other_chat(self):
        request, execute, provider = self.case("PERSONAL")
        request.pop("resume_context"); request["resume_context_error"] = "RESUME_EVIDENCE_LIMIT"
        with self.assertRaisesRegex(ValueError, "RESUME_EVIDENCE_LIMIT"): execute(request, lambda: "synthetic-key", provider)
        self.assertEqual(len(provider.calls), 1)
        request, execute, provider = self.case("PERSONAL", medium="chat")
        request.pop("resume_context"); request["resume_context_error"] = "RESUME_EVIDENCE_LIMIT"
        result = execute(request, lambda: "synthetic-key", provider)
        self.assertNotIn("deliverable", result); self.assertNotIn("resume_task", result)
        self.assertEqual(len(provider.calls), 1)


class TemplateResolverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helpers = read_fixture("resume_task_runtime_regression.py")
        cls.fixture = cls.helpers["node_fixture"]()
        # An actual valid synthetic PNG avoids bypassing the visual decoder.
        cls.raw = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aqlcAAAAASUVORK5CYII=")

    def template_case(self):
        fixture = copy.deepcopy(self.fixture); context = fixture["context"]
        scope = context["scope"]
        template = {"name": "Synthetic-Reference.png", "mime_type": "image/png", "size": len(self.raw),
            "content_hash": "sha256:" + hashlib.sha256(self.raw).hexdigest(),
            "archive": {**scope, "request_id": "qa-archived-template", "index": 0}}
        context["template"] = template; context["consent"]["template_reuse_confirmed"] = True
        seal(context)
        head = {"scope": copy.deepcopy(scope), "template": copy.deepcopy(template), "revision": context["expected_task_revision"]}
        turn = {"domain": scope["domain"], "conversation_id": scope["conversation_id"], "authority": "SOURCE_INPUT_ONLY",
            "files": [{**{key: template[key] for key in ("name", "mime_type", "size", "content_hash")}, "file": {"synthetic": "blob"}}]}
        class Library:
            def __init__(library): library.head, library.turn, library.reads = copy.deepcopy(head), copy.deepcopy(turn), []
            def read_record(library, workspace, database, store, key):
                library.reads.append((workspace, database, store, key))
                if database == "job-radar-local-first-v1" and store == "resume_tasks" and key == context["task_id"]: return {"record": library.head}
                if database == "ariadne-conversation-attachments-v1" and store == "turns" and key == template["archive"]["request_id"]: return {"record": library.turn}
                return {"record": None}
            def blob(library, workspace, entry): return {"data": base64.b64encode(self.raw).decode()}
        payload = {"resume_context": context, "runtime_snapshot": fixture["runtime_snapshot"], "human_message": context["current_human"], "request_id": "qa-new-turn"}
        intent = {"instruction": context["current_human"], "template_name": template["name"], "continue": False}
        return context, payload, intent, Library()

    def test_archived_template_requires_exact_persisted_task_and_original_binding(self):
        context, payload, intent, library = self.template_case()
        token = Template.TEMPLATE_RESOLVER.set(Template.resolver("PERSONAL", library))
        try:
            actual, parts = Template.prepare_task(payload, intent)
        finally: Template.TEMPLATE_RESOLVER.reset(token)
        self.assertEqual(actual["template"], context["template"])
        self.assertEqual(len([p for p in parts if p["type"] == "image_url"]), 1)
        self.assertEqual(library.reads[0][3], context["task_id"])
        self.assertEqual(library.reads[1][3], "qa-archived-template")
        for mutation in ("consent", "domain", "workspace", "revision", "head_template", "authority", "conversation", "ordinal", "filename", "hash"):
            context, payload, intent, library = self.template_case()
            if mutation == "consent": context["consent"]["template_reuse_confirmed"] = False
            elif mutation == "domain": context["scope"]["domain"] = "JOB_OVERVIEW"
            elif mutation == "workspace": context["template"]["archive"]["workspace"] = "b" * 32
            elif mutation == "revision": library.head["revision"] += 1
            elif mutation == "head_template": library.head["template"]["name"] = "Other.png"
            elif mutation == "authority": library.turn["authority"] = "MODEL_APPROVED"
            elif mutation == "conversation": library.turn["conversation_id"] = "OTHER"
            elif mutation == "ordinal": library.turn["files"] = []
            elif mutation == "filename": library.turn["files"][0]["name"] = "Other.png"
            else: library.turn["files"][0]["content_hash"] = "sha256:" + "0" * 64
            seal(context)
            token = Template.TEMPLATE_RESOLVER.set(Template.resolver("PERSONAL", library))
            try:
                with self.subTest(mutation=mutation), self.assertRaises(ValueError): Template.prepare_task(payload, intent)
            finally: Template.TEMPLATE_RESOLVER.reset(token)

    def test_inline_web_reuse_still_requires_consent_and_exact_bytes(self):
        context, payload, intent, _ = self.template_case()
        payload["resume_template_data"] = "data:image/png;base64," + base64.b64encode(self.raw).decode()
        actual, parts = Template.prepare_task(payload, intent)
        self.assertEqual(actual["template"]["content_hash"], context["template"]["content_hash"])
        self.assertTrue(parts)
        for mode in ("no_consent", "missing", "changed_bytes", "mime"):
            bad = copy.deepcopy(payload)
            if mode == "no_consent": bad["resume_context"]["consent"]["template_reuse_confirmed"] = False; seal(bad["resume_context"])
            elif mode == "missing": bad.pop("resume_template_data")
            elif mode == "changed_bytes": bad["resume_template_data"] = "data:image/png;base64," + base64.b64encode(self.raw + b"x").decode()
            else: bad["resume_template_data"] = bad["resume_template_data"].replace("image/png", "image/jpeg")
            with self.subTest(mode=mode), self.assertRaises(ValueError): Template.prepare_task(bad, intent)

    def test_current_turn_resolver_is_not_relaxed_to_allow_historical_reference(self):
        context, payload, intent, library = self.template_case()
        item = {key: context["template"][key] for key in ("name", "mime_type", "size", "content_hash")}
        item["local_reference"] = {"workspace": context["scope"]["workspace"], "request_id": "qa-archived-template", "index": 0}
        resolve = CurrentAttachment.resolver("PERSONAL", library)
        with self.assertRaisesRegex(ValueError, "attachment_reference_invalid"): resolve(payload, item)
        # Exact current-turn identity remains usable, but is not a historical
        # permission token. The new Task resolver owns the separate reuse path.
        payload["request_id"] = "qa-archived-template"
        self.assertEqual(resolve(payload, item), self.raw)

    def test_new_template_uses_current_turn_bytes_and_sets_exact_archive(self):
        context, payload, intent, _ = self.template_case()
        context["template"] = None; context["consent"]["template_reuse_confirmed"] = False; seal(context)
        meta = {"name": "Synthetic-New.png", "mime_type": "image/png", "size": len(self.raw), "content_hash": "sha256:" + hashlib.sha256(self.raw).hexdigest()}
        payload["attachments"] = {"contract_id": "ariadne-conversation-attachments-v1", "request_id": payload["request_id"],
            "files": [{**meta, "data_url": "data:image/png;base64," + base64.b64encode(self.raw).decode()}],
            "consent": {"confirmed": True, "provider": payload["runtime_snapshot"]["provider"], "model": payload["runtime_snapshot"]["model"], "purpose": "CURRENT_CONVERSATION_TURN"}}
        intent["template_name"] = meta["name"]
        actual, parts = Template.prepare_task(payload, intent)
        self.assertEqual(actual["template"], {**meta, "archive": {**context["scope"], "request_id": "qa-new-turn", "index": 0}})
        self.assertFalse(actual["consent"]["template_reuse_confirmed"])
        self.assertTrue(parts)
        wrong = copy.deepcopy(payload); wrong["attachments"]["request_id"] = "qa-archived-template"
        with self.assertRaises(ValueError): Template.prepare_task(wrong, intent)


if __name__ == "__main__":
    unittest.main()
