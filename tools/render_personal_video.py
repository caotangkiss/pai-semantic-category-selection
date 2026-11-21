#!/usr/bin/env python3
"""Render the approved slides with the student's recorded voice.

Uses the existing media drawing helpers, Pillow and FFmpeg. The edit manifest
records source intervals and sentence boundaries; no voice synthesis is used.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
import tempfile
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEO = ROOT / 'video'
spec = importlib.util.spec_from_file_location('project_media', ROOT / 'tools/render-media.py')
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)
Canvas, frame, caption, arrow = media.Canvas, media.frame, media.caption, media.arrow
INK, MUTED, TEAL, PALE = media.INK, media.MUTED, media.TEAL, media.PALE


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def duration(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                      '-of', 'default=noprint_wrappers=1:nokey=1', str(path)]).stdout)


def stamp(seconds):
    milliseconds = round(seconds * 1000)
    return f'{milliseconds // 3600000:02}:{milliseconds // 60000 % 60:02}:{milliseconds // 1000 % 60:02}.{milliseconds % 1000:03}'


def load_script():
    script = (VIDEO / 'VIDEO-SCRIPT.md').read_text()
    review = (VIDEO / 'VIDEO-REVISION-DRAFT.zh-CN.md').read_text()
    narration = review.split('## 英文朗读稿\n', 1)[1].split('## 中文对照', 1)[0]
    english = [p.strip() for p in narration.split('\n\n') if re.match(r'^[A-Z]', p.strip())]
    translation = review.split('## 中文对照\n', 1)[1].split('\n## ', 1)[0]
    chinese = [s.strip() for s in re.findall(r'[^。！？]+[。！？]', translation)]
    assert len(english) == len(chinese), 'Each spoken sentence needs one Chinese translation.'
    return script, english, chinese


def render_audio(plan, work):
    source = VIDEO / plan['source_file']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == plan['source_sha256']
    keeps = plan['keep_intervals']
    clean_duration = sum(end - start for start, end in keeps)
    speech_duration = plan['duration'] - plan['lead_seconds'] - plan['tail_seconds']
    tempo = clean_duration / speech_duration
    filters = [f'[0:a]asplit={len(keeps)}' + ''.join(f'[a{i}]' for i in range(len(keeps)))]
    for i, (start, end) in enumerate(keeps):
        assert end > start
        filters.append(f'[a{i}]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,'
                       f'afade=t=in:d=0.005,afade=t=out:st={end-start-0.005}:d=0.005[c{i}]')
    filters.append(''.join(f'[c{i}]' for i in range(len(keeps))) +
                   f'concat=n={len(keeps)}:v=0:a=1[clean]')
    clean = work / 'clean.wav'
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-filter_complex', ';'.join(filters),
         '-map', '[clean]', '-map_metadata', '-1', '-c:a', 'pcm_s24le', str(clean)])
    processing = (f'highpass=f=70,lowpass=f=10000,afftdn=nr=6:nf=-50:tn=1,'
                  f'rubberband=tempo={tempo:.10f}:pitch=1:formant=preserved,'
                  f'adelay={round(plan["lead_seconds"]*1000)},apad,atrim=duration={plan["duration"]}')
    target = 'I=-16:TP=-1.5:LRA=7:dual_mono=true'
    measured = run(['ffmpeg', '-hide_banner', '-i', str(clean), '-af',
                    processing + ',loudnorm=' + target + ':print_format=json', '-f', 'null', '-'])
    stats = json.loads(re.search(r'\{\s*"input_i".*?\}', measured.stderr, re.S).group())
    normalization = (target + f':measured_I={stats["input_i"]}:measured_TP={stats["input_tp"]}'
                     f':measured_LRA={stats["input_lra"]}:measured_thresh={stats["input_thresh"]}'
                     f':offset={stats["target_offset"]}:linear=true')
    output = VIDEO / 'narration-processed.m4a'
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(clean), '-af', processing + ',loudnorm=' + normalization,
         '-ar', '48000', '-ac', '1', '-map_metadata', '-1', '-c:a', 'aac', '-b:a', '192k', str(output)])
    report = {'source_duration': duration(source), 'kept_duration': clean_duration,
              'tempo': tempo, 'processed_duration': duration(output),
              'processing': processing, 'loudness_first_pass': stats}
    (VIDEO / 'audio-processing.json').write_text(json.dumps(report, indent=2) + '\n')
    return tempo


def mapped_time(source_time, plan, tempo):
    elapsed = sum(max(0, min(source_time, end) - start) for start, end in plan['keep_intervals'])
    return plan['lead_seconds'] + elapsed / tempo


def slides(script):
    review = (VIDEO / 'VIDEO-REVISION-DRAFT.zh-CN.md').read_text()
    data = json.loads((ROOT / 'app/experiment-data.json').read_text())
    policy = json.loads((ROOT / 'app/category-policy.json').read_text())
    case = next(row for row in data['cases'] if row['id'] == 'ketchup')
    candidates = {row['id']: row for row in case['candidates']}
    selected = candidates[case['recorded']['selectedId']]
    source = next(row for row in case['inputs'] if row['index'] == case['recorded']['sourceIndex'])
    mass = sum(candidates[i]['p'] for i in case['categoryMembers']['food'] if i in source['supportedIds'])
    top_food = sum(row['p'] for row in case['top'] if row['text'].strip() in ('salad', 'burger', 'sandwich'))
    r = policy['thresholds']['min_group_mass_ratio']
    delta = policy['thresholds']['max_relative_gap']
    gap = (case['original']['p'] - selected['p']) / case['original']['p']
    pct = lambda p: f'{100*p:.3f}%'
    scenes = []

    c = frame('Can related candidates guide a better choice?', '1 / 5')
    c.wrap(80, 245, 'Can a language model choose a more sensible next token?', 1400, 49, INK, 'bold')
    c.text(80, 405, 'For researchers and developers of text generation', 34, TEAL, 'bold')
    c.rect(80, 485, 670, 155, PALE, 12)
    c.text(110, 512, 'Greedy decoding', 31, INK, 'bold')
    c.wrap(110, 565, 'Choose the single most probable token.', 610, 30, MUTED)
    c.rect(790, 485, 730, 155, PALE, 12)
    c.text(820, 512, 'The question', 31, INK, 'bold')
    question = re.search(r'开场右侧问题框直接写：\*\*(.+?)\*\*', review).group(1)
    c.wrap(820, 565, question, 660, 30, MUTED)
    scenes.append(c)

    c = frame('A pattern in the probabilities', '2 / 5')
    c.text(80, 235, case['prompt'] + ' ...', 40, INK, 'mono')
    expectation = re.search(r'概率图对照句：\*\*(.+?)\*\*', review).group(1)
    c.text(80, 283, expectation, 25, MUTED)
    for i, row in enumerate(case['top'][:4]):
        y = 320 + i * 65
        c.text(80, y, row['text'].strip(), 34, INK, 'bold')
        c.rect(310, y, 800 * row['p'] / case['original']['p'], 33, INK if i == 0 else TEAL, 4)
        c.text(1160, y, pct(row['p']), 33, MUTED)
    c.rect(80, 595, 1440, 65, PALE, 10)
    c.text(105, 614, f'salad + burger + sandwich: {pct(top_food)}  =  {top_food/case["original"]["p"]:.3f} × face', 31, TEAL, 'bold')
    scenes.append(c)

    c = frame('Group candidates. Keep probabilities.', '3 / 5')
    c.text(80, 240, 'Group supported candidates by meaning, then apply two conditions.', 32, INK)
    for i, (label, value, body) in enumerate([
        ('Minimum group ratio R', f'{r:g} times', 'The group must carry enough combined probability.'),
        ('Maximum relative gap δ', f'{delta:.0%}', 'Its best candidate must remain close to the winner.')]):
        x = 80 + 760 * i
        c.text(x, 330, label, 31, INK, 'bold')
        c.text(x, 395, value, 70, TEAL, 'bold')
        c.wrap(x, 505, body, 660, 30, MUTED)
    c.text(80, 625, 'Parameter changes rerun selection using saved GPT-2 measurements.', 28, INK)
    scenes.append(c)

    title = re.search(r'^- Result title: `(.+)`$', script, re.M).group(1)
    check = re.search(r'^- Candidate check: `(.+)`$', script, re.M).group(1)
    values = dict(r=r, delta=delta, gap=gap, original=case['original']['text'].strip(), selected=selected['text'].strip())
    c = frame(title.format(**values), '4 / 5')
    c.text(80, 245, values['original'], 72, INK, 'bold')
    arrow(c, 325, 285, 100)
    c.text(470, 245, values['selected'], 72, TEAL, 'bold')
    c.text(80, 365, 'Supported food probability: ' + pct(mass), 32, INK)
    c.text(80, 423, f'Group / original winner: {mass/case["original"]["p"]:.3f} times ≥ {r:g}', 31, INK)
    c.text(80, 481, check.format(**values), 31, INK)
    c.rect(1120, 235, 400, 315, PALE, 12)
    c.text(1150, 260, 'Other examples', 28, INK, 'bold')
    reference = case['prompt'].split()
    for i, other in enumerate(row for row in data['cases'] if row['id'] != 'ketchup'):
        chosen = next(t for t in other['candidates'] if t['id'] == other['recorded']['selectedId'])
        changes = '; '.join(a + ' → ' + b for a, b in zip(reference, other['prompt'].split()) if a != b)
        c.text(1150, 320 + i * 53, changes + ': ' + chosen['text'].strip(), 26, MUTED)
    c.rect(80, 570, 1440, 95, PALE, 12)
    conclusion = re.search(r'结果页总结：\*\*(.+?)\*\*', review).group(1)
    uncertainty = re.search(r'结果页待验证内容：\*\*(.+?)\*\*', review).group(1)
    c.text(105, 588, conclusion, 31, TEAL, 'bold')
    c.text(105, 631, uncertainty, 27, MUTED)
    scenes.append(c)

    c = frame('Next steps', '5 / 5')
    for y, title, body in [(270, 'Expand semantic categories', 'Cover more kinds of candidate meanings.'),
                           (470, 'Test more varied inputs', 'Explore the selection rule across a wider range of prompts.')]:
        c.text(80, y, title, 44, TEAL, 'bold')
        c.wrap(80, y + 80, body, 1380, 32, MUTED)
    scenes.append(c)
    for scene in scenes:
        scene.text(650, 845, 'Data: recorded local GPT-2 outputs', 22, MUTED)
    return scenes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-audio', action='store_true', help='Reuse the existing processed recording for layout revisions.')
    args = parser.parse_args()
    plan = json.loads((VIDEO / 'narration-edit.json').read_text())
    script, english, chinese = load_script()
    assert len(plan['sentences']) == len(english)
    with tempfile.TemporaryDirectory(prefix='pai-personal-video-') as tmp:
        work = Path(tmp)
        if args.skip_audio:
            tempo = json.loads((VIDEO / 'audio-processing.json').read_text())['tempo']
        else:
            tempo = render_audio(plan, work)
        bases = slides(script)
        cues = []
        for item in plan['sentences']:
            cues.append({**item, 'start': mapped_time(item['source_start'], plan, tempo),
                         'end': mapped_time(item['source_end'], plan, tempo)})
        for i, cue in enumerate(cues):
            cue['start'] = 0 if i == 0 else cue['start']
            cue['end'] = cues[i+1]['start'] if i+1 < len(cues) else plan['duration']
            assert 0 <= cue['start'] < cue['end'] <= plan['duration']
        frames = VIDEO / 'frames'
        frames.mkdir(exist_ok=True)
        listing = []
        for i, cue in enumerate(cues):
            c = Canvas('Narrated project demonstration')
            c.im = bases[cue['scene']].im.copy()
            c.draw = media.ImageDraw.Draw(c.im)
            caption(c, english[cue['sentence_index']])
            path = frames / f'personal-scene-{i+1:02}.png'
            c.save(path)
            listing.extend([f"file '{path.as_posix()}'", f"duration {cue['end']-cue['start']:.9f}"])
        listing.append(f"file '{path.as_posix()}'")
        concat = work / 'frames.txt'
        concat.write_text('\n'.join(listing) + '\n')
        run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat),
             '-i', str(VIDEO / 'narration-processed.m4a'), '-map', '0:v', '-map', '1:a',
             '-t', str(plan['duration']), '-r', '24', '-c:v', 'libx264', '-preset', 'veryfast',
             '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-map_metadata', '-1',
             '-movflags', '+faststart', str(VIDEO / 'demo.mp4')])
        for name, texts, width in [('captions.vtt', english, 64), ('captions.zh-CN.vtt', chinese, 36)]:
            vtt = ['WEBVTT', '']
            for cue in cues:
                vtt += [f'{stamp(cue["start"])} --> {stamp(cue["end"])}',
                        textwrap.fill(texts[cue['sentence_index']], width=width), '']
            (VIDEO / name).write_text('\n'.join(vtt))
        (VIDEO / 'caption-timing.json').write_text(json.dumps(cues, indent=2) + '\n')
    assert duration(VIDEO / 'demo.mp4') <= 60
    print(f'Rendered {duration(VIDEO / "demo.mp4"):.3f}s with the student’s voice, tempo {tempo:.3f}×.')


if __name__ == '__main__':
    main()
