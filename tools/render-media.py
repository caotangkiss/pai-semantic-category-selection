#!/usr/bin/env python3
"""Render project media, using personal narration when its edit manifest is present.

Optional media tools: Pillow, ffmpeg/ffprobe, and macOS `say` (Samantha).
The website itself does not depend on these tools.
"""
import argparse
import html
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
WIDTH, HEIGHT = 1600, 900
BG, INK, MUTED, TEAL, PALE, LINE = '#f7f6f1', '#142b3b', '#50626c', '#087e79', '#e2efeb', '#cbd4d5'
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
FONTS = {'regular': FONT_DIR / 'Arial.ttf', 'bold': FONT_DIR / 'Arial Bold.ttf', 'mono': FONT_DIR / 'Courier New.ttf'}


class Canvas:
    def __init__(self, title):
        self.im = Image.new('RGB', (WIDTH, HEIGHT), BG)
        self.draw = ImageDraw.Draw(self.im)
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img"><title>{html.escape(title)}</title>', f'<rect width="1600" height="900" fill="{BG}"/>']

    def rect(self, x, y, w, h, fill, radius=0):
        self.draw.rounded_rectangle((x, y, x+w, y+h), radius=radius, fill=fill)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}"/>')

    def line(self, x1, y1, x2, y2, color=LINE, width=2):
        self.draw.line((x1, y1, x2, y2), fill=color, width=width)
        self.svg.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}"/>')

    def text(self, x, y, text, size=30, color=INK, weight='regular'):
        font = ImageFont.truetype(str(FONTS[weight]), size)
        self.draw.text((x, y), text, font=font, fill=color, anchor='lt')
        family = 'Courier New, monospace' if weight == 'mono' else 'Arial, sans-serif'
        fw = '700' if weight == 'bold' else '400'
        self.svg.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="{family}" font-size="{size}" font-weight="{fw}" dominant-baseline="text-before-edge">{html.escape(text)}</text>')

    def wrap(self, x, y, text, max_width, size=30, color=INK, weight='regular', line_height=None):
        font = ImageFont.truetype(str(FONTS[weight]), size)
        lines, current = [], ''
        for word in text.split():
            trial = (current+' '+word).strip()
            if current and self.draw.textlength(trial, font=font) > max_width:
                lines.append(current); current = word
            else:
                current = trial
        if current: lines.append(current)
        for i, line in enumerate(lines): self.text(x, y+i*(line_height or int(size*1.35)), line, size, color, weight)
        return len(lines)*(line_height or int(size*1.35))

    def save(self, png, svg=None):
        png.parent.mkdir(parents=True, exist_ok=True)
        self.im.save(png)
        if svg: svg.write_text('\n'.join(self.svg+['</svg>'])+'\n')


def frame(title, chapter):
    c=Canvas(title)
    c.text(80,48,'PROBABILITY FOR AI  /  EXPLORATORY PROJECT',23,MUTED,'bold')
    c.text(80,104,title,56,INK,'bold')
    c.line(80,194,1520,194)
    c.text(80,845,'BEYOND THE TOP TOKEN',22,MUTED,'bold')
    c.text(1380,845,chapter,22,MUTED)
    return c


def caption(c, narration):
    c.rect(0,690,1600,130,INK)
    c.wrap(80,714,narration,1440,27,'#ffffff',line_height=34)


def arrow(c,x,y,length=100):
    c.line(x,y,x+length,y,TEAL,5)
    c.line(x+length-17,y-12,x+length,y,TEAL,5)
    c.line(x+length-17,y+12,x+length,y,TEAL,5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--thumbnail-only', action='store_true', help='Regenerate only the thumbnail PNG and SVG.')
    args, _ = parser.parse_known_args()
    if not args.thumbnail_only and (ROOT / 'video/narration-edit.json').exists():
        from render_personal_video import main as render_recording
        return render_recording()
    data=json.loads((ROOT/'app/experiment-data.json').read_text())
    policy=json.loads((ROOT/'app/category-policy.json').read_text())
    case=next(row for row in data['cases'] if row['id']=='ketchup')
    candidates={row['id']:row for row in case['candidates']}
    selected=candidates[case['recorded']['selectedId']]
    source=next(row for row in case['inputs'] if row['index']==case['recorded']['sourceIndex'])
    supported=set(source['supportedIds'])
    members=[candidates[i] for i in case['categoryMembers']['food'] if i in supported]
    mass=sum(row['p'] for row in members)
    ratio=mass/case['original']['p']
    gap=(case['original']['p']-selected['p'])/case['original']['p']
    r=policy['thresholds']['min_group_mass_ratio']
    delta=policy['thresholds']['max_relative_gap']
    pct=lambda p:f'{p*100:.3f}%'

    cover=Canvas('Beyond the Top Token: category-guided next-token selection with GPT-2')
    cover.rect(0,0,24,900,TEAL)
    cover.text(82,64,'PROBABILITY FOR AI  /  FINAL PROJECT',24,MUTED,'bold')
    cover.text(80,152,'Beyond the',92,INK,'bold')
    cover.text(80,258,'Top Token',92,INK,'bold')
    cover.wrap(84,390,"Can category probability change GPT-2's next word?",760,40,MUTED)
    cover.rect(82,540,1436,110,INK,12)
    cover.text(122,575,case['prompt']+' ...',43,'#ffffff','mono')
    cover.text(88,705,case['original']['text'].strip(),57,INK,'bold')
    cover.text(88,775,pct(case['original']['p'])+' original probability',26,MUTED)
    arrow(cover,440,736,120)
    cover.text(610,705,selected['text'].strip(),57,TEAL,'bold')
    cover.text(612,775,pct(selected['p'])+' original probability',26,MUTED)
    cover.rect(1000,145,516,334,PALE,16)
    cover.text(1030,180,'Supported food group',33,INK,'bold')
    cover.text(1030,262,f'{ratio:.2f}×',104,TEAL,'bold')
    cover.text(1032,408,'the probability of “'+case['original']['text'].strip()+'”',30,MUTED)
    cover.text(1100,724,'5 real cases',31,INK,'bold')
    cover.text(1100,770,'Exploratory study',25,MUTED)
    cover.save(ROOT/'thumbnail/thumbnail.png',ROOT/'thumbnail/thumbnail.svg')
    if args.thumbnail_only:
        print('Created thumbnail/thumbnail.png and thumbnail.svg.')
        return

    script=(ROOT/'video/VIDEO-SCRIPT.md').read_text()
    narration=script.split('## Narration\n\n',1)[1].split('\n\n',1)[0]
    sentences=re.split(r'(?<=[.!?])\s+',narration)
    assert len(sentences)==11, 'Update the scene boundaries after editing the narration.'
    chunks=[' '.join(sentences[a:b]) for a,b in [(0,3),(3,6),(6,8),(8,9),(9,11)]]
    scenes=[]
    c=frame('Why does GPT-2 choose face?', '1 / 5')
    c.text(80,231,case['prompt']+' ...',40,INK,'mono')
    for i,row in enumerate(case['top'][:4]):
        y=315+i*80
        c.text(80,y,row['text'].strip(),34,INK,'bold')
        c.rect(310,y,800*row['p']/case['original']['p'],33,INK if i==0 else TEAL,4)
        c.text(1160,y,pct(row['p']),33,MUTED)
    c.text(310,645,'Original GPT-2 next-token probabilities',25,MUTED)
    caption(c,chunks[0]); scenes.append(c)

    c=frame('Combine evidence. Keep probabilities.', '2 / 5')
    steps=[('01','Find a stopping point','Estimate the input that supports the original winner.'),('02','Follow attention','Inspect inputs strictly above the stopping point.'),('03','Compare a category','Sum its supported candidates; apply two gates.')]
    for i,(n,title,body) in enumerate(steps):
        x=80+i*500
        c.text(x,250,n,52,TEAL,'bold')
        c.wrap(x,337,title,430,34,INK,'bold')
        c.wrap(x,435,body,420,31,MUTED)
    c.text(80,610,'Three embedding-ablation baselines: zero / mean / space',28,MUTED)
    caption(c,chunks[1]); scenes.append(c)

    result_title=re.search(r'^- Result title: `(.+)`$',script,re.MULTILINE)
    candidate_check=re.search(r'^- Candidate check: `(.+)`$',script,re.MULTILINE)
    assert result_title and candidate_check, 'The script must define a result title and candidate check.'
    result_values=dict(r=r,delta=delta,gap=gap,original=case['original']['text'].strip(),selected=selected['text'].strip())
    c=frame(result_title.group(1).format(**result_values), '3 / 5')
    c.text(80,235,'Selected while inspecting input '+source['text'].strip(),35,TEAL,'bold')
    c.text(80,310,case['original']['text'].strip(),75,INK,'bold')
    arrow(c,325,350,100)
    c.text(470,310,selected['text'].strip(),75,TEAL,'bold')
    c.text(80,423,'Supported food probability: '+pct(mass),34,INK)
    c.text(80,485,f'Group / original winner: {ratio:.3f} times  >=  {r:g}',33,INK)
    c.text(80,547,candidate_check.group(1).format(**result_values),33,INK)
    c.rect(1120,250,400,370,PALE,12)
    c.text(1150,287,'Other examples',28,INK,'bold')
    reference_words=case['prompt'].split()
    for i,other in enumerate(row for row in data['cases'] if row['id']!='ketchup'):
        chosen=next(t for t in other['candidates'] if t['id']==other['recorded']['selectedId'])
        words=other['prompt'].split()
        assert len(words)==len(reference_words), 'Update the change labels for prompts with different lengths.'
        changes='; '.join(before+' → '+after for before,after in zip(reference_words,words) if before!=after)
        c.text(1150,350+i*60,changes+': '+chosen['text'].strip(),27,MUTED)
    caption(c,chunks[2]); scenes.append(c)

    c=frame('Adjust the rule, not the model', '4 / 5')
    for i,(label,value,body) in enumerate([('Minimum group ratio R',f'{r:g} times','A category must carry enough combined probability.'),('Maximum relative gap delta',f'{delta:.0%}','Its best candidate must remain close to the winner.')]):
        x=80+760*i
        c.text(x,250,label,31,INK,'bold')
        c.text(x,323,value,80,TEAL,'bold')
        c.wrap(x,450,body,660,32,MUTED)
    c.text(80,604,'The website recomputes selection from recorded measurements.',29,INK)
    caption(c,chunks[3]); scenes.append(c)

    closing_title=re.search(r'The closing slide is titled \*\*(.+?)\*\*',script)
    closing_points=re.findall(r'^- \*\*(.+?)\*\* — (.+)$',script,re.MULTILINE)
    assert closing_title and len(closing_points)==3, 'The script must define a closing title and three points.'
    c=frame(closing_title.group(1), '5 / 5')
    for i,(title,body) in enumerate(closing_points):
        y=235+i*132
        c.text(80,y,title,38,TEAL,'bold')
        c.text(80,y+57,body,30,MUTED)
    caption(c,chunks[4]); scenes.append(c)

    ffmpeg=shutil.which('ffmpeg'); ffprobe=shutil.which('ffprobe'); say=shutil.which('say')
    if not all([ffmpeg,ffprobe,say]): raise RuntimeError('Video rendering requires ffmpeg, ffprobe and macOS say.')
    with tempfile.TemporaryDirectory(prefix='pai-video-') as tmp:
        tmp=Path(tmp); durations=[]
        for i,(scene,chunk) in enumerate(zip(scenes,chunks)):
            scene.save(tmp/f'{i}.png')
            (tmp/f'{i}.txt').write_text(chunk)
            subprocess.run([say,'-v','Samantha','-r','155','-f',str(tmp/f'{i}.txt'),'-o',str(tmp/f'{i}.aiff')],check=True)
            duration=float(subprocess.check_output([ffprobe,'-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(tmp/f'{i}.aiff')]))
            durations.append(duration)
        speed=max(1,sum(durations)/55)
        silence=(59-sum(durations)/speed)/len(scenes)
        vtt=['WEBVTT','']; elapsed=0
        stamp=lambda seconds:f'00:{int(seconds)//60:02d}:{seconds%60:06.3f}'
        for i,(chunk,duration) in enumerate(zip(chunks,durations)):
            seconds=duration/speed+silence
            subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-loop','1','-i',str(tmp/f'{i}.png'),'-i',str(tmp/f'{i}.aiff'),'-t',f'{seconds:.6f}','-r','24','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-af',f'atempo={speed:.8f},apad','-c:a','aac','-ar','48000','-ac','2',str(tmp/f'{i}.mp4')],check=True)
            vtt.extend([f'{stamp(elapsed)} --> {stamp(elapsed+seconds)}',chunk,''])
            elapsed+=seconds
        (tmp/'list.txt').write_text(''.join(f"file '{i}.mp4'\n" for i in range(len(scenes))))
        subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(tmp/'list.txt'),'-c','copy','-movflags','+faststart',str(ROOT/'video/demo.mp4')],check=True)
        (ROOT/'video/captions.vtt').write_text('\n'.join(vtt))
    print('Created thumbnail/thumbnail.png, thumbnail.svg and video/demo.mp4 with captions.vtt.')


if __name__ == '__main__':
    main()
