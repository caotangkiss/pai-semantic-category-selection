# Sources and provenance

## Five exploratory prompts and experiment records

- **Source:** the student's Semantic Category-Guided Next-Token Selection project, [project repository](https://github.com/caotangkiss/semantic-category-calibration), algorithm baseline commit `376a97a`.
- **Material used:** five previously explored prompts, manually configured semantic categories and selection thresholds, and the existing local GPT-2 experiment procedure. The prompts are listed in `experiments/cases.json`; the categories and defaults are in `app/category-policy.json`.
- **Measurements:** `experiments/export_data.py` ran the local GPT-2 model on 2026-11-20 to create probability, attention, and embedding-ablation records for `app/experiment-data.json`. The snapshot includes software versions and hashes for the model files, category policy, prompt manifest, and experiment code. These are model-generated measurements of this project's prompts, not human answer labels, a downloaded benchmark, or simulated numbers.
- **License:** no separate dataset license was supplied for the prompts or experiment records. This project does not relabel those records as MIT-licensed data. The source project's code, policies, and explanatory text remain attributed to that project; no separate code license was supplied with the copied baseline.
- **Scope:** all five prompts had already been examined. There is no locked test set, held-out benchmark, or independent accuracy estimate in this project.

## GPT-2 Small checkpoint and tokenizer

- **Source:** [openai-community/gpt2 model card](https://huggingface.co/openai-community/gpt2).
- **Use:** local generation of next-token probabilities, input attention, and attribution measurements. Weights and tokenizer files remain in the user's existing model directory and are not uploaded with the website.
- **License:** the Hugging Face model card lists MIT. The [original OpenAI GPT-2 license](https://github.com/openai/gpt-2/blob/master/LICENSE) is titled Modified MIT License. These describe the model/software source; they are not a separate license declaration for this project's collected records.

## Feature-ablation explanation

- **Source:** Captum's [attribution algorithm descriptions](https://captum.ai/docs/attribution_algorithms), especially Feature Ablation.
- **Use:** conceptual background for replacing one input feature with a baseline and measuring an output change. This project uses its existing implementation and does not copy Captum source code or install Captum.
- **License:** the [Captum repository license](https://github.com/pytorch/captum/blob/master/LICENSE) is BSD 3-Clause. No Captum dataset is used; no license is being assigned here to the linked explanatory page.

## Probability for AI course starter

- **Source:** the course website-project starter supplied locally by the student, including `AGENTS.md`, `AI-POLICY.md`, the preview setup, and `tools/check.mjs`.
- **URL:** no starter download URL was provided with the local materials.
- **Use:** project structure, preview environment, and upload checks. These supplied files are not claimed as original student or Codex work.
- **License:** no separate license notice was supplied with the starter. Its inclusion here does not assign it a new license.

## Project graphics and narration

The interface graphics and project thumbnail are produced for this project from its own design and experiment records; no external stock-image dataset is used. `video/VIDEO-SCRIPT.md` records the demonstration narration and media-editing process. The current `video/demo.mp4` uses the student's own recorded English voice. The previous version used the local Samantha text-to-speech voice and is preserved, labeled as synthetic, in `video/archive/before-personal-voice/`. No separate media license is declared here.

The website must also display its data provenance and source links because this file is not included in the `app/` upload.

The student supplied both an initial recording (`video/narration-original.m4a`) and the final source recording (`video/narration-source.m4a`). These personal recordings have no public source URL or separately declared media license. The final source is preserved unmodified; editing removes retakes and shortens pauses, reduces noise, normalizes loudness, and adjusts tempo while preserving pitch. No synthesized replacement voice is used in the current video.
