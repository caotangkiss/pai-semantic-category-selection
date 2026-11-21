# 60-second demonstration with personal narration

Title: **Beyond the Top Token — Semantic Category-Guided Next-Token Selection**

The personal-narration version is 59.41 seconds, 1600 × 900, and 1.72 MB. It uses the student's own English recording and five slides drawn from the real experiment records. The source recording is preserved in `narration-source.m4a`. The preceding synthetic-narration video and its captions are preserved in `archive/before-personal-voice/`.

## Narration and translation

The single source for the approved 142-word narration and Chinese translation is [the recording script](VIDEO-REVISION-DRAFT.zh-CN.md#英文朗读稿). Each English paragraph is one caption cue; the renderer derives both subtitle files from that document. The source recording includes retakes, which are removed without replacing the student's voice with synthesized speech.

## On-screen wording

The result slide uses these templates with the existing policy parameters and experiment measurements:

- Result title: `With R = {r:g} and δ = {delta:.2f}: {original} → {selected}`
- Candidate check: `Best candidate relative deficit: {gap:.3%} ≤ {delta:.0%}`

The relative deficit is `(p(original) - p(selected)) / p(original)`, not a difference in percentage points. The comparison labels show the word changed from the ketchup prompt and the resulting selected token. They are generated from the recorded cases.

The question, probability-chart comparison, confidence statement, and remaining uncertainty come from the recording script's **配套画面建议** section. The closing title is **Next steps**. The attribution detail about input `I` remains in the website and written report.

The probability chart adds the original probabilities of `salad`, `burger`, and `sandwich`. The result slide shows the supported food group used by the rule. These are different candidate sets and are labeled separately.

## Recording edits and timing

`narration-edit.json` preserves the source hash, retained source intervals, removed retakes, sentence boundaries, and target duration. It keeps the complete later reading of the rule explanation, parameter explanation, and closing sentence. Long pauses are shortened with speech padding retained.

The 126.20-second source becomes 80.54 seconds after retakes and longer pauses are removed. A tempo factor of 1.369709, with pitch preserved, fits it into the 59.4-second video timeline including brief opening and ending silence. The audio pipeline also applies gentle filtering and noise reduction, and two-pass loudness normalization. `audio-processing.json` records the measured settings. `narration-processed.m4a` is the processed voice track. `caption-timing.json` records the final sentence and scene timings.

## Regenerate the personal-narration video

The public repository includes the finished video and the recording script, but excludes the original and processed audio, archived versions, and generated frame previews. The following video-rendering commands require those locally retained audio files. Website preview and experiment replay do not require them.

Use a Python environment with Pillow, plus FFmpeg with the Rubber Band filter and `ffprobe` on PATH:

```bash
python tools/render-media.py
```

For a visual-only revision that reuses the processed voice:

```bash
python tools/render_personal_video.py --skip-audio
```

The renderer writes `video/demo.mp4`, the two VTT files, and captioned frame previews in `video/frames/`. It does not modify the website, experiment records, or thumbnail. These optional media tools are not website dependencies.
