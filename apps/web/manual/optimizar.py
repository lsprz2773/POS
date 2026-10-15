"""Reduce el peso de las capturas del manual (paleta de 256 colores).

Las capturas a 2x pesan unos 300 KB cada una por los degradados del fondo; con paleta quedan en unos 60 KB y
el texto y los botones se ven igual. Uso: python3 optimizar.py <carpeta>. Requiere Pillow (pip install pillow).
"""

import sys
from pathlib import Path

from PIL import Image

folder = Path(sys.argv[1])
before = after = 0
for path in sorted(folder.glob("*.png")):
    image = Image.open(path)
    if image.mode == "P":  # ya optimizada en una corrida anterior
        continue
    before += path.stat().st_size
    image.convert("RGB").quantize(
        colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG
    ).save(path, optimize=True)
    after += path.stat().st_size
print(f"Capturas optimizadas: {before // 1024} KB -> {after // 1024} KB")
