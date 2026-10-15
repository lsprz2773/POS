// Comprueba que cada imagen que cita docs/manual-usuario.md exista y que no sobre ninguna en docs/img/manual.
// Corre dentro de `npm run check` para que el manual no se quede con capturas rotas o huérfanas.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../docs');
const texto = readFileSync(join(docs, 'manual-usuario.md'), 'utf8');
const citadas = [...texto.matchAll(/\]\((img\/manual\/[^)\s]+)\)/g)].map((m) => m[1]);
const existentes = new Set(
  readdirSync(join(docs, 'img', 'manual')).filter((f) => f.endsWith('.png')),
);

const faltan = citadas.filter((ruta) => !existsSync(join(docs, ruta)));
const sobran = [...existentes].filter((f) => !citadas.includes(`img/manual/${f}`));
const repetidas = citadas.filter((ruta, i) => citadas.indexOf(ruta) !== i);

if (faltan.length || sobran.length || repetidas.length) {
  if (faltan.length) console.error(`Imágenes citadas que no existen: ${faltan.join(', ')}`);
  if (sobran.length) console.error(`Imágenes que el manual no cita: ${sobran.join(', ')}`);
  if (repetidas.length) console.error(`Imágenes citadas más de una vez: ${repetidas.join(', ')}`);
  process.exit(1);
}
console.log(`Manual: ${citadas.length} imágenes citadas, todas existen y ninguna sobra.`);
