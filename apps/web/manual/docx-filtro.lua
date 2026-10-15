-- Filtro de pandoc para el .docx del manual (se usa con `pandoc --lua-filter`).
--  * Quita el título y la frase de apertura del .md: van en los metadatos de la portada.
--  * Mueve el párrafo introductorio debajo de "Cómo usar este manual".
--  * Pone cada parte (Heading 1) y "Cómo usar este manual" en página nueva (el índice queda solo en su hoja).
--  * Da a cada captura el ancho que cabe en la página según su proporción.
--  * Quita las líneas horizontales (las partes ya empiezan en página nueva).

local ANCHO_MAX_CM = 6.5 -- una captura de teléfono
local ALTO_MAX_CM = 19.5 -- lo que cabe de alto en la página Carta
local ANCHO_DOBLE_CM = 13.5 -- capturas partidas en dos columnas

local salto = pandoc.RawBlock('openxml', '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
local primer_titulo, primer_parrafo, primer_h2 = false, false, false
local introduccion = nil

-- Lee el ancho y el alto de un PNG sin dependencias.
local function dimensiones_png(ruta)
  local archivo = io.open(ruta, 'rb')
  if not archivo then return nil end
  local cabecera = archivo:read(24)
  archivo:close()
  if not cabecera or #cabecera < 24 then return nil end
  local function entero(inicio)
    local a, b, c, d = cabecera:byte(inicio, inicio + 3)
    return ((a * 256 + b) * 256 + c) * 256 + d
  end
  return entero(17), entero(21)
end

function Image(img)
  local ancho, alto = dimensiones_png(img.src)
  if not ancho then return nil end
  local proporcion = alto / ancho
  local cm
  if ancho > 1200 then -- partida en dos columnas
    cm = math.min(ANCHO_DOBLE_CM, ALTO_MAX_CM / proporcion)
  else
    cm = math.min(ANCHO_MAX_CM, ALTO_MAX_CM / proporcion)
  end
  img.attributes.width = string.format('%.2fcm', cm)
  img.attributes.height = nil
  return img
end

function Pandoc(doc)
  local bloques = pandoc.List()
  for _, bloque in ipairs(doc.blocks) do
    if bloque.t == 'Header' and bloque.level == 1 and not primer_titulo then
      primer_titulo = true -- el título va en la portada
    elseif bloque.t == 'Para' and primer_titulo and not primer_parrafo then
      primer_parrafo = true -- la frase de apertura va como subtítulo
    elseif bloque.t == 'Para' and primer_parrafo and not introduccion and not primer_h2 then
      introduccion = bloque -- va debajo de "Cómo usar este manual", no en la hoja del índice
    elseif bloque.t == 'HorizontalRule' then
      -- se omite
    else
      if bloque.t == 'Header' and bloque.level == 2 and not primer_h2 then
        primer_h2 = true
        bloques:insert(salto)
      end
      bloques:insert(bloque)
      if bloque.t == 'Header' and bloque.level == 2 and introduccion then
        bloques:insert(introduccion)
        introduccion = nil
      end
    end
  end
  doc.blocks = bloques
  return doc
end

-- Para que `Image` se ejecute antes que `Pandoc`, pandoc recorre el documento por tipos: aquí el orden da igual.
return { { Image = Image }, { Pandoc = Pandoc } }
