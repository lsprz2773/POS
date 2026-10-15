"""Llena el índice del .docx con LibreOffice (pandoc solo deja el campo, que Word llena al abrir).

Abre el .docx, actualiza los índices con sus números de página y lo guarda de nuevo; con --pdf también escribe
el PDF. Uso: python3 docx-indice.py <manual.docx> [--pdf <salida.pdf>]. Requiere LibreOffice con Python-UNO.
"""

import subprocess
import sys
import tempfile
import time
from pathlib import Path

import uno
from com.sun.star.beans import PropertyValue


def propiedad(nombre, valor):
    p = PropertyValue()
    p.Name, p.Value = nombre, valor
    return p


docx = Path(sys.argv[1]).resolve()
pdf = Path(sys.argv[sys.argv.index("--pdf") + 1]).resolve() if "--pdf" in sys.argv else None

perfil = tempfile.mkdtemp(prefix="lo-perfil-")
puerto = 2002
proceso = subprocess.Popen(
    [
        "soffice",
        "--headless",
        "--invisible",
        "--norestore",
        f"-env:UserInstallation=file://{perfil}",
        f"--accept=socket,host=localhost,port={puerto};urp;",
    ],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
try:
    contexto = uno.getComponentContext()
    resolutor = contexto.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", contexto)
    escritorio = None
    for _ in range(60):
        try:
            remoto = resolutor.resolve(f"uno:socket,host=localhost,port={puerto};urp;StarOffice.ComponentContext")
            escritorio = remoto.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", remoto)
            break
        except Exception:
            time.sleep(1)
    if escritorio is None:
        sys.exit("No se pudo conectar con LibreOffice.")

    documento = escritorio.loadComponentFromURL(docx.as_uri(), "_blank", 0, (propiedad("Hidden", True),))
    indices = documento.getDocumentIndexes()
    cuantos = indices.getCount()
    # Dos pasadas: el índice ocupa espacio y mueve las páginas del resto.
    for _ in range(2):
        for i in range(cuantos):
            indices.getByIndex(i).update()
    documento.storeToURL(docx.as_uri(), (propiedad("FilterName", "MS Word 2007 XML"),))
    if pdf:
        documento.storeToURL(pdf.as_uri(), (propiedad("FilterName", "writer_pdf_Export"),))
    documento.close(True)
    print(f"Índices actualizados: {cuantos}.")
finally:
    try:
        escritorio.terminate()
    except Exception:
        pass
    proceso.terminate()
