"""Convierte "memories" (Archivo wdth 125, wght 800) a curvas SVG.
Separa el punto de la i para pintarlo con el naranja del fechador."""
import json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import RecordingPen, DecomposingRecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

src, out = sys.argv[1], sys.argv[2]
font = TTFont(src)
print('axes', [(a.axisTag, a.minValue, a.maxValue) for a in font['fvar'].axes])
inst = instantiateVariableFont(font, {'wdth': 125, 'wght': 800}, inplace=False)
gs = inst.getGlyphSet()
cmap = inst.getBestCmap()
upm = inst['head'].unitsPerEm
text = 'memories'
tracking = -0.035 * upm

def contours(gname):
    rec = DecomposingRecordingPen(gs)
    gs[gname].draw(rec)
    parts, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ('closePath', 'endPath'):
            parts.append(cur); cur = []
    if cur: parts.append(cur)
    return parts

def to_path(ops, dx):
    pen = SVGPathPen(gs)
    tp = TransformPen(pen, (1, 0, 0, -1, dx, 0))  # y hacia abajo
    for op, args in ops:
        getattr(tp, op)(*args)
    return pen.getCommands()

def bounds(ops):
    bp = BoundsPen(gs)
    for op, args in ops:
        getattr(bp, op)(*args)
    return bp.bounds

x = 0
ink, dot = [], []
for i, ch in enumerate(text):
    g = cmap[ord(ch)]
    for c in contours(g):
        b = bounds(c)
        # el punto de la i: contorno chico por encima de la altura x
        if ch == 'i' and b and b[1] > 520:
            dot.append((to_path(c, x), b, x))
        else:
            ink.append(to_path(c, x))
    x += gs[g].width + (tracking if i < len(text) - 1 else 0)

os2 = inst['OS/2']
data = {
    'upm': upm, 'width': x, 'ascender': os2.sTypoAscender, 'xHeight': os2.sxHeight,
    'capHeight': os2.sCapHeight, 'ink': ' '.join(ink), 'dot': [d[0] for d in dot],
    'dotBounds': [[d[1][0] + d[2], -d[1][3], d[1][2] + d[2], -d[1][1]] for d in dot],
}
json.dump(data, open(out, 'w'))
print('width', round(x), 'xHeight', os2.sxHeight, 'dots', len(dot), data['dotBounds'])
