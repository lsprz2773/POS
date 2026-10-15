"""Crea la plantilla de estilos (docs/manual-usuario/referencia.docx) con la que pandoc arma el .docx del manual.

Parte de la plantilla por defecto de pandoc y le da tamaño Carta, márgenes, fuentes, colores, encabezados que
empiezan en página nueva, pie con número de página y tablas con bordes. Solo hace falta volver a correrla si se
quiere cambiar el aspecto. Uso: python3 docx-plantilla.py <plantilla-por-defecto.docx> <salida.docx>
Requiere python-docx (pip install python-docx).
"""

import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Pt, RGBColor

AZUL = RGBColor(0x1E, 0x3F, 0xD0)
OSCURO = RGBColor(0x1B, 0x24, 0x3B)
GRIS = RGBColor(0x5B, 0x65, 0x78)
FUENTE = "Calibri"

doc = Document(sys.argv[1])


def fuente(style, size, bold=None, color=None, italic=None):
    style.font.name = FUENTE
    rpr = style.element.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.append(fonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        fonts.set(qn(attr), FUENTE)
    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if fonts.get(qn(attr)) is not None:
            del fonts.attrib[qn(attr)]
    style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if italic is not None:
        style.font.italic = italic
    if color is not None:
        style.font.color.rgb = color


def parrafo(style, before=0, after=6, line=1.15, keep_next=None, align=None):
    fmt = style.paragraph_format
    fmt.space_before = Pt(before)
    fmt.space_after = Pt(after)
    fmt.line_spacing = line
    if keep_next is not None:
        fmt.keep_with_next = keep_next
    if align is not None:
        fmt.alignment = align


# Página Carta con márgenes cómodos para imprimir.
section = doc.sections[0]
section.page_width, section.page_height = Cm(21.59), Cm(27.94)
section.left_margin = section.right_margin = Cm(2.2)
section.top_margin = Cm(2.2)
section.bottom_margin = Cm(2.2)

# python-docx no encuentra por nombre los estilos de pandoc ("Heading 1"): se buscan recorriendo la lista.
styles = {style.name: style for style in doc.styles}
for name in ("Normal", "Body Text", "First Paragraph", "Compact"):
    fuente(styles[name], 10.5, color=OSCURO)
parrafo(styles["Normal"], after=4)
parrafo(styles["Body Text"], after=6)
parrafo(styles["First Paragraph"], after=6)
parrafo(styles["Compact"], after=2)

fuente(styles["Title"], 32, bold=True, color=AZUL)
parrafo(styles["Title"], before=150, after=12, align=WD_ALIGN_PARAGRAPH.LEFT)
fuente(styles["Subtitle"], 14, color=GRIS)
parrafo(styles["Subtitle"], after=18, align=WD_ALIGN_PARAGRAPH.LEFT)
fuente(styles["Author"], 11, color=GRIS)
parrafo(styles["Author"], after=2, align=WD_ALIGN_PARAGRAPH.LEFT)
fuente(styles["Date"], 11, color=GRIS)
parrafo(styles["Date"], after=2, align=WD_ALIGN_PARAGRAPH.LEFT)

# Cada parte (nivel 1) empieza en página nueva.
fuente(styles["Heading 1"], 24, bold=True, color=AZUL)
parrafo(styles["Heading 1"], before=0, after=12, keep_next=True)
styles["Heading 1"].paragraph_format.page_break_before = True
fuente(styles["Heading 2"], 16, bold=True, color=AZUL)
parrafo(styles["Heading 2"], before=18, after=6, keep_next=True)
fuente(styles["Heading 3"], 12.5, bold=True, color=OSCURO)
parrafo(styles["Heading 3"], before=12, after=4, keep_next=True)
fuente(styles["Heading 4"], 11, bold=True, color=OSCURO)
parrafo(styles["Heading 4"], before=8, after=3, keep_next=True)
fuente(styles["TOC Heading"], 20, bold=True, color=AZUL)
parrafo(styles["TOC Heading"], before=0, after=10)

# Capturas centradas y con su pie.
fuente(styles["Image Caption"], 9, italic=True, color=GRIS)
parrafo(styles["Image Caption"], before=2, after=10, align=WD_ALIGN_PARAGRAPH.CENTER)
parrafo(styles["Figure"], before=4, after=0, align=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True)
parrafo(styles["Captioned Figure"], before=4, after=0, align=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True)
fuente(styles["Caption"], 9, italic=True, color=GRIS)
fuente(styles["Table Caption"], 9, italic=True, color=GRIS)

# Notas (citas en el texto): recuadro azul claro con barra a la izquierda.
bloque = styles["Block Text"]
fuente(bloque, 10.5, color=OSCURO)
parrafo(bloque, before=6, after=8)
bloque.paragraph_format.left_indent = Cm(0.4)
bloque.paragraph_format.right_indent = Cm(0.2)
ppr = bloque.element.get_or_add_pPr()
for old in ppr.findall(qn("w:pBdr")) + ppr.findall(qn("w:shd")):
    ppr.remove(old)
ppr.append(
    parse_xml(
        f'<w:pBdr {nsdecls("w")}><w:left w:val="single" w:sz="24" w:space="8" w:color="1E3FD0"/></w:pBdr>'
    )
)
ppr.append(parse_xml(f'<w:shd {nsdecls("w")} w:val="clear" w:color="auto" w:fill="EEF2FF"/>'))

# Tablas con bordes finos y encabezado sombreado.
tabla = styles["Table"].element
tpr = tabla.find(qn("w:tblPr"))
if tpr is None:
    tpr = OxmlElement("w:tblPr")
    tabla.append(tpr)
for tag in ("w:tblBorders", "w:tblCellMar"):
    for old in tpr.findall(qn(tag)):
        tpr.remove(old)
tpr.append(
    parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        + "".join(
            f'<w:{lado} w:val="single" w:sz="4" w:space="0" w:color="C5CCDB"/>'
            for lado in ("top", "left", "bottom", "right", "insideH", "insideV")
        )
        + "</w:tblBorders>"
    )
)
tpr.append(
    parse_xml(
        f'<w:tblCellMar {nsdecls("w")}><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
        '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>'
    )
)
for old in tabla.findall(qn("w:tblStylePr")):
    tabla.remove(old)
tabla.append(
    parse_xml(
        f'<w:tblStylePr {nsdecls("w")} w:type="firstRow"><w:rPr><w:b/></w:rPr>'
        '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E3E9FB"/></w:tcPr></w:tblStylePr>'
    )
)

# Pie de página: nombre del manual y número de página.
pie = section.footer
pie.is_linked_to_previous = False
p = pie.paragraphs[0] if pie.paragraphs else pie.add_paragraph()
for run in list(p.runs):
    run._element.getparent().remove(run._element)
p.alignment = WD_ALIGN_PARAGRAPH.CENTER


def campo(par, instruccion):
    for tipo, texto in (("begin", None), (None, instruccion), ("separate", None), (None, "1"), ("end", None)):
        run = par.add_run()
        run.font.size = Pt(9)
        run.font.color.rgb = GRIS
        if tipo:
            fc = OxmlElement("w:fldChar")
            fc.set(qn("w:fldCharType"), tipo)
            run._element.append(fc)
        elif texto == instruccion:
            it = OxmlElement("w:instrText")
            it.set(qn("xml:space"), "preserve")
            it.text = f" {instruccion} "
            run._element.append(it)
        else:
            run.text = texto


texto = p.add_run("Manual de usuario · Página ")
texto.font.size = Pt(9)
texto.font.color.rgb = GRIS
campo(p, "PAGE")

doc.save(sys.argv[2])
print("Plantilla creada:", sys.argv[2])
