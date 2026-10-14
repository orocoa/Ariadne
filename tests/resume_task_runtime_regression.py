"""Independent synthetic ResumeTask generation/review contract regressions.

No real Provider, browser, credential reader or private workspace is used.
--result is an offline cross-language fixture used by the Node domain suite.
"""
import copy
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import resume_task_runtime as Runtime
from src import conversation_search as Search

NODE = os.environ.get("ARIADNE_NODE_BINARY", "/Users/kai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node")


def node_fixture(*args):
    return json.loads(subprocess.check_output([NODE, str(ROOT / "tests/resume_task_regression.mjs"), "--fixture", *args], text=True))


def seal(context):
    context["context_fingerprint"] = Runtime.context_fingerprint(context)
    return context


def node_canonical(values):
    """Actual JavaScript canonical text/hash after the real JSON wire boundary."""
    code = """const fs = require('node:fs'); const Task = require('./public/resume-task-domain.js');
    (async () => { const values = JSON.parse(fs.readFileSync(0, 'utf8'));
      const result = await Promise.all(values.map(async value => ({wire: JSON.stringify(value),
        canonical: Task.canonicalJson(value), fingerprint: await Task.fingerprint(value)})));
      process.stdout.write(JSON.stringify(result)); })().catch(error => {process.stderr.write(String(error)); process.exitCode = 1;});"""
    return json.loads(subprocess.check_output([NODE, "-e", code], cwd=ROOT,
        input=json.dumps(values, ensure_ascii=False, allow_nan=False), text=True))


def outputs(context):
    human = next(entry for entry in context["evidence"] if entry["role"] == "CURRENT_HUMAN")
    blocks = [
        {"type": "NAME", "text": "Synthetic Name", "right": "", "emphasis": "REGULAR"},
        {"type": "SECTION", "text": "EDUCATION", "right": "", "emphasis": "REGULAR"},
        {"type": "ENTRY", "text": "Synthetic University", "right": "2024 - 2025", "emphasis": "BOLD"},
        {"type": "BULLET", "text": "Conducted research with 12 participants; deployment was performed by colleagues.", "right": "", "emphasis": "REGULAR"},
        {"type": "SECTION", "text": "EXPERIENCE", "right": "", "emphasis": "REGULAR"},
        {"type": "BULLET", "text": "Modified packaging and designed posters.", "right": "", "emphasis": "REGULAR"},
    ]
    deliverable = {"kind": "RESUME", "title": "Synthetic reviewed resume", "body": "", "nodes": [], "edges": [],
        "resume": {"template_name": (context.get("template") or {}).get("name", ""), "review_notes": [],
            "layout": {"margin_mm": 15, "body_pt": 10.5, "line_height": 1.3, "name_pt": 21, "section_pt": 13, "section_gap_pt": 12}, "blocks": blocks}}
    grounding, reviews = [], []
    for index, block in enumerate(blocks):
        structural = block["type"] in ("SECTION", "PAGE_BREAK")
        text_refs = [] if structural else [human["ref"]]
        right_refs = [human["ref"]] if block["right"] else []
        grounding.append({"block_index": index, "text_source_refs": text_refs, "right_source_refs": right_refs})
        def field(refs):
            return {"status": "SUPPORTED" if refs else "STRUCTURAL", "source_refs": refs,
                "source_states": [human["source_state"]] if refs else [],
                "reason": "Current user self-report; no external verification is claimed." if refs else "Layout or empty field only."}
        reviews.append({"block_index": index, "text": field(text_refs), "right": field(right_refs)})
    generation = {"status": "GENERATED", "message": "Draft preserves current responsibility and numeric corrections.", "deliverable": deliverable, "grounding": grounding}
    manifest = json.loads((ROOT / "data/resume_task_contract_v1.json").read_text())
    review = {"status": "READY", "message": "Current source statements support the employer-facing draft.",
        "block_reviews": reviews, "checks": {key: "PASS" for key in manifest["review_checks"]}, "issues": []}
    return generation, review


class Provider:
    def __init__(self, generation, review, *, fail_at=None, wrong_model_at=None, mutate_payload=False):
        self.generation, self.review = generation, review
        self.fail_at, self.wrong_model_at, self.mutate_payload = fail_at, wrong_model_at, mutate_payload
        self.calls = []

    def __call__(self, credential, payload):
        self.calls.append(copy.deepcopy(payload))
        index = len(self.calls)
        assert credential == "synthetic-key"
        if self.fail_at == index:
            return 503, {"error": {"message": "synthetic provider unavailable"}}
        tool = payload["tools"][0]["function"]["name"]
        assert tool == ("generate_resume_task" if index == 1 else "review_resume_task")
        value = self.generation if index == 1 else self.review
        if self.mutate_payload:
            payload["messages"] = []
        return 200, {"model": "wrong-test-model" if self.wrong_model_at == index else self.calls[-1]["model"],
            "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [{"function": {"name": tool, "arguments": json.dumps(value, ensure_ascii=False)}}]}}],
            "usage": {"prompt_tokens": 40, "completion_tokens": 20, "total_tokens": 60}}


def execute_fixture(fixture, provider=None):
    generation, review = outputs(fixture["context"])
    if fixture.get("proposal_text"):
        generation["deliverable"]["resume"]["blocks"][-1]["text"] = fixture["proposal_text"]
    if fixture.get("historical_grounding"):
        source = next(item for item in fixture["context"]["evidence"] if item["role"] == "CONVERSATION_HUMAN_UNCONFIRMED")
        generation["grounding"][-1]["text_source_refs"] = [source["ref"]]
        review["block_reviews"][-1]["text"].update(source_refs=[source["ref"]], source_states=[source["source_state"]],
            reason="Earlier actual user statement in this conversation; not separately saved or externally verified.")
    if fixture.get("generation_status") == "NEEDS_FACTS":
        generation = {"status": "NEEDS_FACTS", "message": "What name should appear in the resume?", "deliverable": None, "grounding": []}
    if fixture.get("review_status") == "REVISION_REQUIRED":
        review.update(status="REVISION_REQUIRED", message="The current responsibility correction contradicts the proposed final field.")
        review["block_reviews"][-1]["text"].update(status="CONTRADICTED", reason="The current user correction excludes this achievement.")
        review["checks"]["current_corrections"] = "BLOCK"
        review["issues"] = [{"kind": "REJECTED_CLAIM_RETURNED", "block_indexes": [len(generation["deliverable"]["resume"]["blocks"]) - 1],
            "source_refs": generation["grounding"][-1]["text_source_refs"], "explanation": "The proposed field repeats an explicitly withdrawn claim.", "question": ""}]
    call = provider or Provider(generation, review)
    kwargs = {"attachment_parts": fixture["attachment_parts"]} if fixture.get("attachment_parts") is not None else {}
    result = Runtime.execute(fixture["context"], fixture["intent"], fixture["runtime_snapshot"], "synthetic-key", call, **kwargs)
    return result, call


if "--result" in sys.argv:
    fixture = json.loads(sys.stdin.read())
    result, _ = execute_fixture(fixture)
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(0)


class ResumeTaskRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = node_fixture()
        cls.large = node_fixture("--large")
        cls.template = node_fixture("--with-template")
        cls.continuation = node_fixture("--continuation")
        cls.history = {domain: node_fixture("--with-history", "--history-domain", domain)
            for domain in ("CANDIDATE", "JOB", "PERSONAL", "JOB_OVERVIEW")}
        cls.many_history = node_fixture("--with-history", "--many-history")
        cls.numeric = node_fixture("--numeric-source")

    def test_ready_requires_two_calls_and_has_no_candidate_write_authority(self):
        result, provider = execute_fixture(copy.deepcopy(self.fixture))
        self.assertEqual(result["status"], "READY")
        self.assertEqual(result["calls"], 2)
        self.assertEqual(len(provider.calls), 2)
        self.assertEqual(result["persistence"], "not_written")
        self.assertEqual(result["deliverable"], result["proposal"])
        self.assertEqual(result["context_fingerprint"], self.fixture["context"]["context_fingerprint"])
        self.assertEqual(result["model"], self.fixture["runtime_snapshot"]["model"])
        self.assertEqual(result["review"]["checks"]["current_corrections"], "PASS")

    def test_full_large_raw_tail_and_current_correction_reach_both_calls(self):
        fixture = copy.deepcopy(self.large)
        self.assertGreater(len(json.dumps(fixture["context"], ensure_ascii=False).encode()), 100000)
        result, provider = execute_fixture(fixture, Provider(*outputs(fixture["context"]), mutate_payload=True))
        self.assertEqual(result["status"], "READY")
        for payload in provider.calls:
            visible = json.dumps(payload, ensure_ascii=False)
            for index in range(1, 13):
                self.assertIn(f"TAIL_{index}_DEPLOYMENT_BY_COLLEAGUES", visible)
            self.assertIn("old claims about 20 products and 8 suppliers are withdrawn", visible)
        # The review receives the full source packet, not only the generation.
        self.assertNotEqual(provider.calls[0]["messages"], provider.calls[1]["messages"])

    def test_four_actual_human_store_forms_reach_both_calls_before_first_task(self):
        for domain, original in self.history.items():
            fixture = copy.deepcopy(original); fixture["historical_grounding"] = True
            source = next(item for item in fixture["context"]["evidence"] if item["role"] == "CONVERSATION_HUMAN_UNCONFIRMED")
            manifest = next(item for item in fixture["context"]["evidence_manifest"] if item["ref"] == source["ref"])
            with self.subTest(domain=domain):
                self.assertIsNone(fixture["context"]["prior_task"])
                self.assertEqual(source["source_state"], "CONVERSATION_HISTORY_UNCONFIRMED")
                self.assertTrue(manifest["identity"].startswith("conversation-human:" + Runtime.HISTORY_STORES[domain] + ":"))
                self.assertEqual(manifest["semantic_hash"], Runtime.fingerprint(source["content"]))
                result, provider = execute_fixture(fixture)
                self.assertEqual(result["status"], "READY")
                self.assertEqual(len(provider.calls), 2)
                self.assertEqual(result["review"]["block_reviews"][-1]["text"]["source_states"], ["CONVERSATION_HISTORY_UNCONFIRMED"])
                for payload in provider.calls:
                    visible = json.dumps(payload, ensure_ascii=False)
                    self.assertIn(source["content"]["text"], visible)
                    self.assertIn(source["content"]["created_at"], visible)
                    self.assertNotIn("ASSISTANT_ONLY_CORRECTION_MUST_NOT_BECOME_FACTS", visible)
                    self.assertNotIn("Other chat Human exclusion marker", visible)
                    self.assertNotIn(Search.FLAG, payload)

    def test_complete_history_over_ordinary_turn_limit_reaches_both_calls(self):
        fixture = copy.deepcopy(self.many_history)
        sources = [item for item in fixture["context"]["evidence"] if item["role"] == "CONVERSATION_HUMAN_UNCONFIRMED"]
        self.assertEqual(len(sources), 55)
        _, provider = execute_fixture(fixture)
        for payload in provider.calls:
            visible = json.dumps(payload, ensure_ascii=False)
            for index in range(1, 56): self.assertIn(f"ROW_{index}_TAIL", visible)

    def test_conversation_human_state_date_digest_and_store_identity_fail_before_provider(self):
        for mode in ("state", "date", "extra_content", "digest", "wrong_store", "empty_record", "source_document"):
            fixture = copy.deepcopy(self.history["PERSONAL"])
            source = next(item for item in fixture["context"]["evidence"] if item["role"] == "CONVERSATION_HUMAN_UNCONFIRMED")
            manifest = next(item for item in fixture["context"]["evidence_manifest"] if item["ref"] == source["ref"])
            if mode == "state": source["source_state"] = "TASK_HISTORY_UNCONFIRMED"
            elif mode == "date": source["content"]["created_at"] = "earlier"
            elif mode == "extra_content": source["content"]["is_verified"] = True
            elif mode == "digest": manifest["semantic_hash"] = "sha256:" + "0" * 64
            elif mode == "wrong_store": manifest["identity"] = "conversation-human:job_conversation_messages:qa-user"
            elif mode == "empty_record": manifest["identity"] = "conversation-human:personal_conversation_turns:"
            else: manifest["source_ids"] = ["synthetic-document"]
            if mode != "digest": manifest["semantic_hash"] = Runtime.fingerprint(source["content"])
            seal(fixture["context"])
            provider = Provider(*outputs(fixture["context"]))
            with self.subTest(mode=mode), self.assertRaises(ValueError): execute_fixture(fixture, provider)
            self.assertEqual(provider.calls, [])

    def test_reviewer_unknown_historical_hypothesis_never_becomes_download(self):
        # This tests the semantic review verdict gate, not a local word matcher
        # or a claim that the substitute reviewer understood the question.
        fixture = copy.deepcopy(self.history["PERSONAL"])
        source = next(item for item in fixture["context"]["evidence"] if item["role"] == "CONVERSATION_HUMAN_UNCONFIRMED")
        source["content"]["text"] = "Hypothetically, would a 900 percent sales improvement sound good? I am asking, not reporting a result."
        manifest = next(item for item in fixture["context"]["evidence_manifest"] if item["ref"] == source["ref"])
        manifest["semantic_hash"] = Runtime.fingerprint(source["content"]); seal(fixture["context"])
        generation, review = outputs(fixture["context"])
        generation["deliverable"]["resume"]["blocks"][-1]["text"] = "Improved sales by 900 percent."
        generation["grounding"][-1]["text_source_refs"] = [source["ref"]]
        review.update(status="NEEDS_FACTS", message="What was your actual measurable result?")
        review["block_reviews"][-1]["text"].update(status="UNKNOWN", source_refs=[source["ref"]],
            source_states=[source["source_state"]], reason="The earlier question does not assert a personal achievement.")
        review["issues"] = [{"kind": "UNRESOLVED_FACT", "block_indexes": [5], "source_refs": [source["ref"]],
            "explanation": "The proposed metric lacks an actual self-report.", "question": "What was your actual result?"}]
        result, provider = execute_fixture(fixture, Provider(generation, review))
        self.assertEqual(result["status"], "NEEDS_FACTS"); self.assertIsNone(result["deliverable"])
        self.assertEqual(result["proposal"], generation["deliverable"]); self.assertEqual(len(provider.calls), 2)
        for payload in provider.calls: self.assertIn(source["content"]["text"], json.dumps(payload))

    def test_canonical_numbers_and_hashes_match_actual_node_wire(self):
        positive = [0, 1.0, 1.5, 10.5, 1e-7, 1e-6, 9.999999999999997e-7,
            1e20, 1e21, 1e23, 1.2345678901234567e19, 1.7976931348623157e308,
            5e-324, 2.2250738585072014e-308, 333333333.33333329]
        values = [{"value": value} for value in [*positive, *[-value for value in positive]]]
        values.append({"layout": outputs(self.fixture["context"])[0]["deliverable"]["resume"]["layout"],
            "nested": {"words": "中文/emoji😀/é", "numbers": positive}})
        for expected in node_canonical(values):
            wire = json.loads(expected["wire"])
            with self.subTest(wire=expected["wire"]):
                self.assertEqual(Runtime._json(wire), expected["canonical"])
                self.assertEqual(Runtime.fingerprint(wire), expected["fingerprint"])
        self.assertEqual(Runtime._json({"value": -0.0}), '{"value":0}')

    def test_actual_numeric_record_packet_validates_and_is_not_rounded_or_dropped(self):
        fixture = copy.deepcopy(self.numeric); Runtime.validate_context(fixture["context"])
        self.assertEqual(Runtime.context_fingerprint(fixture["context"]), fixture["context"]["context_fingerprint"])
        fact = next(fact for source in fixture["context"]["evidence"] for fact in source["content"].get("facts", [])
            if fact["label"] == "Accepted numeric structured field")
        expected = copy.deepcopy(fact["value"])
        result, provider = execute_fixture(fixture)
        self.assertEqual(result["status"], "READY"); self.assertEqual(fact["value"], expected)
        for payload in provider.calls:
            rendered = payload["messages"][-1]["content"]
            self.assertIn("NUMERIC_SOURCE_FULL_TAIL", rendered)
            for index, number in enumerate(expected["values"], 1):
                self.assertIn(f"- {index}: {json.dumps(number)}\n", rendered)

    def test_nonfinite_numbers_fail_before_provider(self):
        for value in (math.inf, -math.inf, math.nan):
            fixture = copy.deepcopy(self.numeric); fixture["context"]["evidence"][0]["content"]["invalid_numeric"] = value
            provider = Provider(*outputs(fixture["context"]))
            with self.subTest(value=value), self.assertRaises(ValueError): execute_fixture(fixture, provider)
            self.assertEqual(provider.calls, [])

    def test_complete_prior_document_reaches_both_calls_only_when_continuing(self):
        result, provider = execute_fixture(copy.deepcopy(self.continuation))
        self.assertEqual(result["status"], "READY")
        for payload in provider.calls:
            self.assertIn("PRIOR_DOC_FINAL_TAIL_DEPLOYMENT_BY_COLLEAGUES", json.dumps(payload))
            self.assertNotIn(Search.FLAG, payload)
        new_task = copy.deepcopy(self.continuation); new_task["intent"]["continue"] = False
        _, provider = execute_fixture(new_task)
        for payload in provider.calls:
            self.assertNotIn("PRIOR_DOC_FINAL_TAIL_DEPLOYMENT_BY_COLLEAGUES", json.dumps(payload), "a new document does not inherit old model text")

    def test_resealed_human_refs_require_actual_content_and_task_history(self):
        for mode in ("current_digest", "fabricated_history"):
            fixture = copy.deepcopy(self.continuation)
            context = fixture["context"]
            role = "CURRENT_HUMAN" if mode == "current_digest" else "TASK_HUMAN_UNCONFIRMED"
            source = next(item for item in context["evidence"] if item["role"] == role)
            manifest = next(item for item in context["evidence_manifest"] if item["ref"] == source["ref"])
            if mode == "current_digest": manifest["semantic_hash"] = "sha256:" + "0" * 64
            else:
                source["content"]["text"] = "Fabricated unrelated earlier statement."
                manifest["semantic_hash"] = Runtime.fingerprint(source["content"])
            seal(context)
            provider = Provider(*outputs(context))
            with self.subTest(mode=mode), self.assertRaises(ValueError): execute_fixture(fixture, provider)
            self.assertEqual(provider.calls, [])

    def test_budget_or_partial_manifest_is_rejected_before_provider(self):
        variants = []
        large = copy.deepcopy(self.large); large["context"]["evidence"][0]["content"]["oversized_probe"] = "X" * 300000; seal(large["context"]); variants.append(large)
        missing = copy.deepcopy(self.fixture); missing["context"]["evidence"].pop(0); seal(missing["context"]); variants.append(missing)
        partial = copy.deepcopy(self.fixture); partial["context"]["coverage"] = {"complete": False}; seal(partial["context"]); variants.append(partial)
        for fixture in variants:
            provider = Provider(*outputs(fixture["context"]))
            with self.subTest(keys=list(fixture["context"])), self.assertRaises(ValueError):
                execute_fixture(fixture, provider)
            self.assertEqual(provider.calls, [])

    def test_false_consent_or_local_runtime_makes_zero_provider_calls(self):
        for mode in ("consent", "local"):
            fixture = copy.deepcopy(self.fixture)
            if mode == "consent": fixture["context"]["consent"]["confirmed"] = False; seal(fixture["context"])
            else: fixture["runtime_snapshot"]["mode"] = "local"
            provider = Provider(*outputs(fixture["context"]))
            with self.subTest(mode=mode), self.assertRaises(ValueError): execute_fixture(fixture, provider)
            self.assertEqual(provider.calls, [])

    def test_unknown_template_and_job_refs_cannot_support_personal_facts(self):
        for reference in ("unknown-ref", "template-1", "job-1"):
            fixture = copy.deepcopy(self.fixture); generation, review = outputs(fixture["context"])
            generation["grounding"][0]["text_source_refs"] = [reference]
            provider = Provider(generation, review)
            with self.subTest(reference=reference), self.assertRaises(ValueError): execute_fixture(fixture, provider)
            self.assertEqual(len(provider.calls), 1, "bad generation must not enter review")

    def test_each_nonempty_field_is_grounded_and_each_block_reviewed_once(self):
        generation, review = outputs(self.fixture["context"])
        invalid_generation = []
        missing = copy.deepcopy(generation); missing["grounding"].pop(); invalid_generation.append(missing)
        empty = copy.deepcopy(generation); empty["grounding"][0]["text_source_refs"] = []; invalid_generation.append(empty)
        right = copy.deepcopy(generation); right["grounding"][2]["right_source_refs"] = []; invalid_generation.append(right)
        duplicate = copy.deepcopy(generation); duplicate["grounding"].append(copy.deepcopy(duplicate["grounding"][0])); invalid_generation.append(duplicate)
        for value in invalid_generation:
            with self.assertRaises(ValueError): Runtime.validate_generation(value, self.fixture["context"], self.fixture["intent"])
        for change in ("missing", "duplicate", "changed_refs", "extra_document"):
            value = copy.deepcopy(review)
            if change == "missing": value["block_reviews"].pop()
            elif change == "duplicate": value["block_reviews"].append(copy.deepcopy(value["block_reviews"][0]))
            elif change == "changed_refs": value["block_reviews"][0]["text"]["source_refs"] = []
            else: value["deliverable"] = copy.deepcopy(generation["deliverable"])
            with self.subTest(change=change), self.assertRaises(ValueError): Runtime.validate_review(value, generation, self.fixture["context"])

    def test_ready_with_unsupported_field_block_check_or_issue_is_invalid(self):
        generation, review = outputs(self.fixture["context"])
        for change in ("contradicted", "unknown", "false_structural", "blocked_check", "issue", "external_verified"):
            value = copy.deepcopy(review)
            field = value["block_reviews"][0]["text"]
            if change == "contradicted": field["status"] = "CONTRADICTED"
            elif change == "unknown": field["status"] = "UNKNOWN"
            elif change == "false_structural": field.update(status="STRUCTURAL", source_refs=[], source_states=[])
            elif change == "blocked_check": value["checks"]["current_corrections"] = "BLOCK"
            elif change == "issue": value["issues"] = [{"kind": "UNSUPPORTED_FACT", "block_indexes": [0], "source_refs": field["source_refs"], "explanation": "Synthetic identity mismatch", "question": ""}]
            else: field["source_states"] = ["EXTERNALLY_VERIFIED"]
            with self.subTest(change=change), self.assertRaises(ValueError): Runtime.validate_review(value, generation, self.fixture["context"])

    def test_review_rejection_retains_proposal_but_never_exports_it(self):
        fixture = copy.deepcopy(self.fixture); generation, review = outputs(fixture["context"])
        review.update(status="REVISION_REQUIRED", message="A draft responsibility is contradicted by the current correction.")
        review["block_reviews"][3]["text"].update(status="CONTRADICTED", reason="Current correction takes precedence.")
        review["checks"]["current_corrections"] = "BLOCK"
        review["issues"] = [{"kind": "UNSUPPORTED_FACT", "block_indexes": [3], "source_refs": generation["grounding"][3]["text_source_refs"], "explanation": "Draft must preserve the latest responsibility correction.", "question": ""}]
        result, provider = execute_fixture(fixture, Provider(generation, review))
        self.assertEqual(result["status"], "REVISION_REQUIRED")
        self.assertIsNone(result["deliverable"])
        self.assertEqual(result["proposal"], generation["deliverable"])
        self.assertEqual(result["persistence"], "not_written")
        self.assertEqual(len(provider.calls), 2)

    def test_generation_needs_facts_does_not_review_or_export(self):
        fixture = copy.deepcopy(self.fixture)
        generation = {"status": "NEEDS_FACTS", "message": "Please provide the missing identity.", "deliverable": None, "grounding": []}
        result, provider = execute_fixture(fixture, Provider(generation, None))
        self.assertEqual(result["status"], "NEEDS_FACTS")
        self.assertIsNone(result["deliverable"])
        self.assertEqual(len(provider.calls), 1)

    def test_same_complete_template_parts_reach_generation_and_review(self):
        result, provider = execute_fixture(copy.deepcopy(self.template))
        self.assertEqual(result["status"], "READY")
        for payload in provider.calls:
            parts = [part for message in payload["messages"] if isinstance(message["content"], list) for part in message["content"]]
            images = [part for part in parts if part["type"] == "image_url"]
            self.assertEqual(images, self.template["attachment_parts"])
            self.assertEqual(len(images), 2)
        missing = copy.deepcopy(self.template); missing.pop("attachment_parts")
        provider = Provider(*outputs(missing["context"]))
        with self.assertRaises(ValueError): execute_fixture(missing, provider)
        self.assertEqual(provider.calls, [])

    def test_provider_or_model_identity_failure_never_returns_an_export(self):
        for failure in ("generation", "review", "identity_generation", "identity_review"):
            fixture = copy.deepcopy(self.fixture); generation, review = outputs(fixture["context"])
            provider = Provider(generation, review, fail_at=1 if failure == "generation" else 2 if failure == "review" else None,
                wrong_model_at=1 if failure == "identity_generation" else 2 if failure == "identity_review" else None)
            with self.subTest(failure=failure), self.assertRaises(ValueError): execute_fixture(fixture, provider)
            self.assertLessEqual(len(provider.calls), 2)

    def test_semantic_pdf_purpose_is_exact_boolean_and_uses_actual_document(self):
        pdf = {"kind": "PDF", "title": "Synthetic application", "body": "Actual complete proposed document.", "nodes": [], "edges": []}
        for expected in (True, False):
            calls, usage = [], []
            def provider(credential, payload):
                calls.append(copy.deepcopy(payload)); self.assertEqual(credential, "synthetic-key")
                tool = payload["tools"][0]["function"]["name"]
                return 200, {"model": payload["model"], "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [{"function": {"name": tool, "arguments": json.dumps({"is_resume": expected})}}]}}], "usage": {"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6}}
            actual = Runtime.classify_pdf(self.continuation["context"], pdf, self.continuation["context"]["current_human"], self.continuation["runtime_snapshot"], "synthetic-key", provider, usage_sink=usage.append)
            self.assertIs(actual, expected)
            self.assertEqual(len(calls), 1); self.assertEqual(usage, [{"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6}])
            self.assertEqual(calls[0]["tools"][0]["function"]["name"], Runtime.PURPOSE_TOOL)
            visible = json.dumps(calls[0])
            self.assertIn("Actual complete proposed document.", visible)
            self.assertNotIn("PRIOR_DOC_FINAL_TAIL_DEPLOYMENT_BY_COLLEAGUES", visible, "purpose classification cannot send the full stored draft")
            self.assertIn("prior_resume_available", visible)
            self.assertNotIn("Synthetic evidence 1", visible, "purpose classification cannot send Candidate records")
            self.assertNotIn(Search.FLAG, calls[0])
        # Missing full resume context can still classify an ordinary report;
        # an actual resume verdict subsequently fails in the delivery glue.
        self.assertIs(Runtime.classify_pdf(None, pdf, self.fixture["context"]["current_human"], self.fixture["runtime_snapshot"], "synthetic-key", provider), False)

    def test_purpose_malformed_identity_search_or_finish_never_assumes_false(self):
        pdf = {"kind": "PDF", "title": "Synthetic report", "body": "Actual body.", "nodes": [], "edges": []}
        for mode in ("string_boolean", "numeric_boolean", "missing_key", "extra_key", "duplicate_key", "model", "tool", "search", "stop", "http"):
            calls = []
            def provider(_, payload):
                calls.append(payload)
                raw = {"is_resume": "false"} if mode == "string_boolean" else {"is_resume": 0} if mode == "numeric_boolean" else {} if mode == "missing_key" else {"is_resume": False, "comment": "skip"} if mode == "extra_key" else {"is_resume": False}
                function = {"name": "wrong-tool" if mode == "tool" else Runtime.PURPOSE_TOOL,
                    "arguments": '{"is_resume":false,"is_resume":true}' if mode == "duplicate_key" else json.dumps(raw)}
                response = {"model": "wrong-model" if mode == "model" else payload["model"], "choices": [{"finish_reason": "stop" if mode == "stop" else "tool_calls", "message": {"tool_calls": [{"function": function}]}}]}
                if mode == "search": response["web_search"] = {"sources": []}
                return (503 if mode == "http" else 200), response
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                Runtime.classify_pdf(self.fixture["context"], pdf, self.fixture["context"]["current_human"], self.fixture["runtime_snapshot"], "synthetic-key", provider)
            self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
