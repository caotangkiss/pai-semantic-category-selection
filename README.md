# Beyond the Top Token

**Semantic Category-Guided Next-Token Selection** is an exploratory next-token selection project. The English website replays five previously explored, real GPT-2 cases and lets you adjust two selection parameters. It keeps the model's original probabilities unchanged. The browser uses bundled data: it does not run GPT-2, request new predictions, or use a network API.

## Preview locally

With Node.js installed, run from this directory:

```bash
npm install
npm run dev
```

Open the local address printed by Vite. Check the upload rules with:

```bash
node tools/check.mjs
```

## Reproduce the local GPT-2 data

Use Python 3.9–3.11 and an existing GPT-2 Small directory containing configuration, tokenizer files, and safetensors weights:

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -r experiments/requirements.txt
.venv/bin/python experiments/export_data.py --model-dir /path/to/gpt2
```

Replace `/path/to/gpt2` with your existing model directory. Model weights and virtual environments are not included or copied. The exporter reruns the five prompts in `experiments/cases.json` and writes the website snapshot to `app/experiment-data.json`.

`app/category-policy.json` is the single source for configured categories and default thresholds. The website replays threshold changes against the recorded support relationships. Changing category membership requires a new export to obtain any missing candidate measurements. The original local CLI remains available at `experiments/semantic_category_selection.py`.

## Submission files

- **Website:** upload only the files inside `app/`. Do not upload the Python scripts, model, virtual environment, or this repository's other folders as website files.
- **Thumbnail:** upload [thumbnail/thumbnail.png](thumbnail/thumbnail.png) separately (1600 × 900). The editable SVG is alongside it.
- **Video:** [video/demo.mp4](video/demo.mp4) is a 59.41-second, 1.72 MB demonstration using my own recorded English narration and embedded captions. Retakes and long pauses were edited out; the audio was cleaned, normalized, and adjusted to about 1.37× tempo while preserving pitch. It presents slides drawn from the real experiment records. [The narration and media-editing guide](video/VIDEO-SCRIPT.md) document the source and processing; the previous synthetic-narration version is preserved in `video/archive/before-personal-voice/`.

The five cases are exploratory, not a locked test set. The project demonstrates a selection rule; it does not establish higher accuracy or better probability calibration. See [the project summary](writeup/PROJECT-SUMMARY.md), [sources and licenses](SOURCES.md), and [AI assistance notes](AI-NOTES.md).

## Public repository contents

This repository includes the website, recorded experiment data, Python experiment code, checks, documentation, thumbnail, final narrated video, and subtitles. The final video contains my own recorded voice. Unedited recordings, standalone audio tracks, old media versions, generated frame previews, model weights, dependencies, environment files, and local caches remain on my computer and are excluded from Git.

The approved bilingual recording script is included because the media renderer reads it. Other Chinese documentation copies remain local. Rendering the personal-narration video requires the original recording (or the processed audio for `--skip-audio`), which is not distributed. The website and experiment replay checks run using the included files.

To regenerate only the thumbnail, install Pillow in a separate Python environment and run `python tools/render-media.py --thumbnail-only`. The media renderer uses macOS system fonts; these optional tools are separate from the website dependencies.
