"""Hace que cada captura vaya siempre en la misma página que el párrafo que la describe y que su pie.

Word reparte las páginas sin saber que un paso y su captura son una unidad: el texto puede quedar al final de una
hoja y la imagen al principio de la siguiente. Aquí se marca "conservar con el siguiente" en el párrafo anterior a
cada captura, y en la captura (para que no se separe de su pie). Uso: python3 docx-juntos.py <manual.docx>.
Requiere python-docx.
"""

import sys

from docx import Document
from docx.oxml.ns import qn

ruta = sys.argv[1]
doc = Document(ruta)
cuerpo = doc.element.body
parrafos = [p for p in cuerpo.iter(qn("w:p"))]

with_imagen = 0
for i, p in enumerate(parrafos):
    if p.find(".//" + qn("w:drawing")) is None:
        continue
    with_imagen += 1
    ppr = p.get_or_add_pPr()
    for marca in ("w:keepNext", "w:keepLines"):
        if ppr.find(qn(marca)) is None:
            ppr.insert(0, ppr.makeelement(qn(marca), {}))
    if i > 0:
        previo = parrafos[i - 1]
        if previo.getparent().tag == qn("w:tc"):
            continue  # el anterior es el final de una tabla: no se engancha
        # Solo si el párrafo anterior es texto del mismo paso (no el fondo anclado en el encabezado: vive en otra parte).
        previo_ppr = previo.get_or_add_pPr()
        if previo_ppr.find(qn("w:keepNext")) is None:
            previo_ppr.insert(0, previo_ppr.makeelement(qn("w:keepNext"), {}))
        if previo_ppr.find(qn("w:keepLines")) is None:
            previo_ppr.insert(0, previo_ppr.makeelement(qn("w:keepLines"), {}))

# Las tablas del manual son cortas: se mantienen completas en una página y ninguna fila se corta.
tablas = 0
for tabla in cuerpo.iter(qn("w:tbl")):
    filas = tabla.findall(qn("w:tr"))
    if len(filas) > 16:
        continue
    tablas += 1
    for numero, fila in enumerate(filas):
        trpr = fila.find(qn("w:trPr"))
        if trpr is None:
            trpr = fila.makeelement(qn("w:trPr"), {})
            fila.insert(0 if fila.find(qn("w:tblPrEx")) is None else 1, trpr)
        if trpr.find(qn("w:cantSplit")) is None:
            trpr.append(trpr.makeelement(qn("w:cantSplit"), {}))
        if numero < len(filas) - 1:  # todas menos la última se pegan a la siguiente
            for par in fila.iter(qn("w:p")):
                ppr = par.get_or_add_pPr()
                if ppr.find(qn("w:keepNext")) is None:
                    ppr.insert(0, ppr.makeelement(qn("w:keepNext"), {}))
    # La frase que presenta la tabla también se queda con ella.
    anterior = tabla.getprevious()
    if anterior is not None and anterior.tag == qn("w:p"):
        ppr = anterior.get_or_add_pPr()
        if ppr.find(qn("w:keepNext")) is None:
            ppr.insert(0, ppr.makeelement(qn("w:keepNext"), {}))

doc.save(ruta)
print(f"Capturas ligadas a su descripción: {with_imagen}. Tablas completas en una página: {tablas}.")
