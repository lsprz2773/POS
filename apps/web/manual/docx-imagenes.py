"""Prepara las capturas para el .docx: las muy largas se parten en dos columnas para que se lean grandes.

Una página de Word no puede mostrar una captura de 4 000 píxeles de alto sin dejarla diminuta; partida por la
mitad y puesta lado a lado se ve del doble de ancho. El corte se hace en la fila más uniforme cercana a la mitad
(el hueco entre dos tarjetas), para no partir un renglón de texto. Las demás se copian tal cual.
Uso: python3 docx-imagenes.py <carpeta-origen> <carpeta-destino>. Requiere Pillow y numpy.
"""

import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ORIGEN, DESTINO = Path(sys.argv[1]), Path(sys.argv[2])
LIMITE = 3.0  # alto / ancho a partir del cual se parte en dos columnas
SEPARACION = 40  # píxeles blancos entre columnas

DESTINO.mkdir(parents=True, exist_ok=True)
partidas = 0
for ruta in sorted(ORIGEN.glob("*.png")):
    imagen = Image.open(ruta).convert("RGB")
    ancho, alto = imagen.size
    if alto / ancho <= LIMITE:
        shutil.copy(ruta, DESTINO / ruta.name)
        continue
    pixeles = np.asarray(imagen, dtype=np.int16)
    mitad = alto // 2
    ventana = range(int(alto * 0.35), int(alto * 0.65))
    # Fila con menos variación de color en su vecindad: el hueco entre tarjetas.
    corte = min(ventana, key=lambda y: pixeles[y : y + 6].std(axis=(0, 1)).sum())
    arriba, abajo = imagen.crop((0, 0, ancho, corte)), imagen.crop((0, corte, ancho, alto))
    lienzo = Image.new("RGB", (ancho * 2 + SEPARACION, max(arriba.height, abajo.height)), "white")
    lienzo.paste(arriba, (0, 0))
    lienzo.paste(abajo, (ancho + SEPARACION, 0))
    lienzo.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(
        DESTINO / ruta.name, optimize=True
    )
    partidas += 1
print(f"Imágenes preparadas para el .docx: {len(list(DESTINO.glob('*.png')))} ({partidas} partidas en dos columnas)")
