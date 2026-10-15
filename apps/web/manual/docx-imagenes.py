"""Prepara las capturas para el .docx: esquinas redondeadas, borde claro y sombra suave (como las tarjetas de
vidrio de la app), y las muy largas se parten en dos columnas para que se lean grandes.

Una página de Word no puede mostrar una captura de 4 000 píxeles de alto sin dejarla diminuta; partida por la
mitad y puesta lado a lado se ve del doble de ancho. El corte se hace en la fila más uniforme cercana a la mitad
(el hueco entre dos tarjetas), para no partir un renglón de texto. Las demás se copian tal cual.
Uso: python3 docx-imagenes.py <carpeta-origen> <carpeta-destino>. Requiere Pillow y numpy.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ORIGEN, DESTINO = Path(sys.argv[1]), Path(sys.argv[2])
LIMITE = 3.0  # alto / ancho a partir del cual se parte en dos columnas

RADIO = 44  # esquinas, a la escala de las capturas (2x)
MARGEN = 40  # espacio transparente alrededor para la sombra


def tarjeta(imagen):
    """Esquinas redondeadas, borde blanco y sombra azulada suave; devuelve una imagen con transparencia."""
    ancho, alto = imagen.size
    lienzo = Image.new("RGBA", (ancho + MARGEN * 2, alto + MARGEN * 2), (0, 0, 0, 0))
    mascara = Image.new("L", imagen.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, ancho - 1, alto - 1), radius=RADIO, fill=255)
    sombra = Image.new("RGBA", lienzo.size, (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle(
        (MARGEN, MARGEN + 10, MARGEN + ancho, MARGEN + alto + 10), radius=RADIO, fill=(0x1F, 0x32, 0x5A, 80)
    )
    lienzo.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(14)))
    lienzo.paste(imagen.convert("RGBA"), (MARGEN, MARGEN), mascara)
    borde = Image.new("RGBA", lienzo.size, (0, 0, 0, 0))
    ImageDraw.Draw(borde).rounded_rectangle(
        (MARGEN, MARGEN, MARGEN + ancho - 1, MARGEN + alto - 1), radius=RADIO, outline=(255, 255, 255, 220), width=3
    )
    lienzo.alpha_composite(borde)
    return lienzo


def guardar(lienzo, ruta):
    lienzo.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(
        ruta, optimize=True
    )


DESTINO.mkdir(parents=True, exist_ok=True)
partidas = 0
for ruta in sorted(ORIGEN.glob("*.png")):
    imagen = Image.open(ruta).convert("RGB")
    ancho, alto = imagen.size
    if alto / ancho <= LIMITE:
        guardar(tarjeta(imagen), DESTINO / ruta.name)
        continue
    pixeles = np.asarray(imagen, dtype=np.int16)
    mitad = alto // 2
    ventana = range(int(alto * 0.35), int(alto * 0.65))
    # Fila con menos variación de color en su vecindad: el hueco entre tarjetas.
    corte = min(ventana, key=lambda y: pixeles[y : y + 6].std(axis=(0, 1)).sum())
    arriba, abajo = imagen.crop((0, 0, ancho, corte)), imagen.crop((0, corte, ancho, alto))
    izquierda, derecha = tarjeta(arriba), tarjeta(abajo)
    lienzo = Image.new("RGBA", (izquierda.width + derecha.width, max(izquierda.height, derecha.height)), (0, 0, 0, 0))
    lienzo.alpha_composite(izquierda, (0, 0))
    lienzo.alpha_composite(derecha, (izquierda.width, 0))
    guardar(lienzo, DESTINO / ruta.name)
    partidas += 1
print(f"Imágenes preparadas para el .docx: {len(list(DESTINO.glob('*.png')))} ({partidas} partidas en dos columnas)")
