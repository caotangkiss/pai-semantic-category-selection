#!/usr/bin/env python3
"""Export real local GPT-2 runs and Python reference decisions for offline replay."""
import argparse
import copy
import hashlib
import json
import os
import platform
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import semantic_category_selection as core

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CASES = ROOT / "experiments" / "cases.json"
DEFAULT_DATA = ROOT / "app" / "experiment-data.json"
DEFAULT_CHECKS = ROOT / "experiments" / "replay-checks.json"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def candidate(record):
    return {"id": record["token_id"], "text": record["text"], "p": record["probability"]}


def recorded(decision):
    return {
        "selectedId": decision["selected"]["token_id"],
        "status": decision["status"],
        "sourceIndex": decision.get("selected_source", {}).get("index"),
        "groupId": decision.get("selected_group"),
    }


def parity_check(case_id, decision, ratio, gap):
    return {
        "caseId": case_id,
        "thresholds": {"minGroupRatio": ratio, "maxRelativeGap": gap},
        "expected": recorded(decision),
        "stochastic": any(step.get("tie_breaker") == "random" for step in decision["trace"]),
        "trace": [{"sourceIndex": step["source"]["index"],
                   "primaryGroupId": step["primary_group"], "status": step["status"]}
                  for step in decision["trace"]],
    }


def export_case(spec, tokenizer, model, policy):
    import torch

    prompt = spec["prompt"]
    if not core.supported_boundary(prompt):
        raise ValueError(f"Case {spec['id']!r} must end in an English letter for this experiment.")
    inputs, spans = core.encode_prompt(prompt, tokenizer, model, offsets=True)
    with torch.inference_mode():
        output = model(**inputs, output_attentions=True, use_cache=False)
        logits = output.logits[0, -1]
        probs = core.probabilities(logits)
        attention = core.attention_summary(inputs, spans, output.attentions, tokenizer)
        attribution = core.attribute_candidates(inputs, logits, attention, tokenizer, model, policy)
        decision = core.choose_token(prompt, probs, tokenizer, attention, policy, attribution=attribution)
        top_ids = probs.topk(min(core.DEFAULT_TOP_K, probs.numel())).indices.tolist()
        category_members, skipped_members = {}, {}
        candidate_ids = set(top_ids) | {decision["original"]["token_id"]}
        for group in policy["groups"]:
            members, skipped = core.category_members(group, probs, tokenizer)
            category_members[group["id"]] = [member["token_id"] for member in members]
            skipped_members[group["id"]] = skipped
            candidate_ids.update(category_members[group["id"]])
        exported = {
            "id": spec["id"], "prompt": prompt,
            "original": candidate(decision["original"]),
            "top": [candidate(core.token_record(i, probs, tokenizer)) for i in top_ids],
            "candidates": [candidate(core.token_record(i, probs, tokenizer)) for i in sorted(candidate_ids)],
            "categoryMembers": category_members,
            "skippedMultitokenMembers": skipped_members,
            "inputs": [{"index": row["source"]["index"], "text": row["source"]["text"],
                        "attention": row["source"]["attention"],
                        "originalDrops": row["original_drops"],
                        "supportedIds": row["supported_token_ids"]}
                       for row in attribution["tokens"]],
            "stopIndex": attribution["original_source"]["index"] if attribution["original_source"] else None,
            "baselineSourceIndices": attribution["baseline_source_indices"],
            "attributionPasses": attribution["additional_forward_passes"],
            "recorded": recorded(decision),
        }

        # These are implementation-parity checks, not a held-out evaluation set.
        ratios = (1.01, 1.5, 2.0, 3.0, 5.0)
        gaps = (0.0, 0.05, 0.10, 0.25, 0.50, 1.0)
        threshold_pairs = {(r, d) for r in ratios for d in gaps}
        defaults = policy["thresholds"]
        threshold_pairs.add((defaults["min_group_mass_ratio"], defaults["max_relative_gap"]))
        # Exercise inclusive boundary comparisons using actual group evidence.
        for group in decision["groups"]:
            if group["best"] and group["mass_ratio"] > 1:
                r, d = group["mass_ratio"], group["relative_gap"]
                for offset in (-1e-9, 0.0, 1e-9):
                    if r + offset > 1 and 0 <= d <= 1:
                        threshold_pairs.add((r + offset, d))
                    if 0 <= d + offset <= 1:
                        threshold_pairs.add((r, d + offset))
        checks = []
        for ratio, gap in sorted(threshold_pairs):
            comparison_policy = copy.deepcopy(policy)
            comparison_policy["thresholds"].update(min_group_mass_ratio=ratio, max_relative_gap=gap)
            reference = core.choose_token(prompt, probs, tokenizer, attention, comparison_policy,
                                          attribution=attribution)
            checks.append(parity_check(spec["id"], reference, ratio, gap))
    return exported, checks


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True, type=Path, help="Existing local GPT-2 model directory")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--output", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--checks", type=Path, default=DEFAULT_CHECKS)
    args = parser.parse_args()
    manifest = json.loads(args.cases.read_text(encoding="utf-8"))
    if manifest.get("studyType") != "exploratory" or manifest.get("lockedTestSet") is not False:
        raise ValueError("This exporter records already-explored cases; it cannot label them a locked test set.")
    ids = [row["id"] for row in manifest["cases"]]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError("Case IDs must be nonempty and unique.")
    os.environ["HF_HOME"] = str(ROOT / "experiments" / ".cache" / "huggingface")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    policy = core.load_policy()
    tokenizer, model = core.load_model(args.model_dir.resolve())
    cases, checks = [], []
    for spec in manifest["cases"]:
        print(f"Running {spec['id']}: {spec['prompt']}", flush=True)
        case, case_checks = export_case(spec, tokenizer, model, policy)
        cases.append(case)
        checks.extend(case_checks)
        print(f"  {case['recorded']['status']}; {len(case_checks)} replay checks", flush=True)
    model_files = ("config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json",
                   "vocab.json", "merges.txt", "special_tokens_map.json")
    metadata = {
        "model": "GPT-2 Small (124M)", "modelType": model.config.model_type,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "studyType": "exploratory", "lockedTestSet": False,
        "python": platform.python_version(), "torch": version("torch"), "transformers": version("transformers"),
        "baselines": list(core.ATTRIBUTION_BASELINES), "attributionTolerance": core.ATTRIBUTION_TOLERANCE,
        "sourceCommit": "376a97a", "device": str(next(model.parameters()).device),
        "dtype": str(next(model.parameters()).dtype), "attentionImplementation": "eager",
        "attentionAggregation": "Final input position as query; equal mean over all layers and heads.",
        "layers": model.config.n_layer, "headsPerLayer": model.config.n_head,
        "vocabularySize": model.config.vocab_size, "displayTopK": core.DEFAULT_TOP_K,
        "probabilitiesUnchanged": True, "modelWeightsUnchanged": True,
        "candidateScope": "Original winner, displayed top candidates, and every configured single-token category member.",
        "policySha256": sha256(core.DEFAULT_POLICY_PATH),
        "manifestSha256": sha256(args.cases),
        "experimentCodeSha256": sha256(Path(core.__file__)),
        "modelFileSha256": {name: sha256(args.model_dir / name) for name in model_files
                            if (args.model_dir / name).is_file()},
    }
    write_json(args.output, {"schemaVersion": 1, "metadata": metadata, "cases": cases})
    write_json(args.checks, {"schemaVersion": 1, "purpose": "Python-to-browser implementation parity; not model evaluation.",
                             "dataSha256": sha256(args.output), "policySha256": metadata["policySha256"],
                             "checks": checks})
    print(f"Exported {len(cases)} real cases and {len(checks)} reference decisions.", flush=True)


if __name__ == "__main__":
    main()
