#!/usr/bin/env python3
"""index.html'deki tüm CSS ve JS dosyalarını gömerek tek dosyalık dist/Mahsupla.html üretir.
Kullanım: python3 tools/build-single.py"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')

def inline_css(m):
    css = (root / m.group(1)).read_text(encoding='utf-8')
    return '<style>\n' + css + '\n</style>'

def inline_js(m):
    js = (root / m.group(1)).read_text(encoding='utf-8')
    js = re.sub(r'</(script)', r'<\\/\1', js, flags=re.I)  # gömülü betiği erken kapatmasın
    return '<script>/* ' + m.group(1) + ' */\n' + js + '\n</script>'

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

out = root / 'dist' / 'Mahsupla.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8')
print(out, f'{out.stat().st_size / 1024:.0f} KB')
