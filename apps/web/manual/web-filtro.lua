-- Filtro de pandoc para la página web del manual: el título y la frase de apertura ya van en la portada
-- de la plantilla, así que se quitan del cuerpo (y del índice).
local titulo_quitado, apertura_quitada = false, false

function Pandoc(doc)
  local bloques = pandoc.List()
  for _, bloque in ipairs(doc.blocks) do
    if bloque.t == 'Header' and bloque.level == 1 and not titulo_quitado then
      titulo_quitado = true
    elseif bloque.t == 'Para' and titulo_quitado and not apertura_quitada then
      apertura_quitada = true
    else
      bloques:insert(bloque)
    end
  end
  doc.blocks = bloques
  return doc
end
