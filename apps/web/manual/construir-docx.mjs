// `npm run manual:docx`: genera docs/manual-usuario/manual-usuario.docx (manual completo con todas las imágenes)
// a partir de docs/manual-usuario.md. `npm run manual:pdf` lo convierte a PDF con LibreOffice y
// `npm run manual:web` arma la página web (docs/manual-usuario/web/index.html, no se versiona).
// Requiere pandoc, Python con Pillow y numpy, y (para el PDF y el índice) LibreOffice.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = fileURLToPath(new URL('.', import.meta.url));
const raiz = resolve(aqui, '../../..');
const docs = join(raiz, 'docs');
const salida = join(docs, 'manual-usuario', 'manual-usuario.docx');
const modo = process.argv[2] ?? 'docx';

function ejecutar(comando, args, opciones = {}) {
  const resultado = spawnSync(comando, args, { stdio: 'inherit', ...opciones });
  if (resultado.error?.code === 'ENOENT') {
    console.error(`Falta "${comando}". Instálalo para poder generar el manual.`);
    process.exit(1);
  }
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}

if (modo === 'docx') {
  const temporal = mkdtempSync(join(tmpdir(), 'manual-'));
  try {
    // El .md y las imágenes ya preparadas viven juntos para que las rutas relativas funcionen.
    mkdirSync(join(temporal, 'img', 'manual'), { recursive: true });
    copyFileSync(join(docs, 'manual-usuario.md'), join(temporal, 'manual.md'));
    ejecutar('python3', [
      '-I',
      join(aqui, 'docx-imagenes.py'),
      join(docs, 'img', 'manual'),
      join(temporal, 'img', 'manual'),
    ]);

    const texto = readFileSync(join(docs, 'manual-usuario.md'), 'utf8');
    const apertura =
      texto.split('\n').find((linea, i, lineas) => i > 0 && linea.trim() && lineas[i - 1] === '') ??
      '';
    const fecha = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      timeZone: 'America/Mexico_City',
    });
    // Los metadatos van en un archivo UTF-8: por la línea de comandos pandoc pierde los acentos.
    const metadatos = {
      lang: 'es-MX',
      title: 'Manual de usuario',
      subtitle: apertura,
      date: fecha,
      'toc-title': 'Contenido',
    };
    writeFileSync(join(temporal, 'metadatos.json'), JSON.stringify(metadatos));
    ejecutar(
      'pandoc',
      [
        'manual.md',
        '--from=markdown+pipe_tables+implicit_figures',
        '--to=docx',
        `--reference-doc=${join(docs, 'manual-usuario', 'referencia.docx')}`,
        `--lua-filter=${join(aqui, 'docx-filtro.lua')}`,
        '--metadata-file=metadatos.json',
        '--toc',
        '--toc-depth=2',
        `--output=${salida}`,
      ],
      { cwd: temporal },
    );
    // Pandoc solo deja el campo del índice (Word lo llena al abrir); LibreOffice lo llena aquí con sus páginas.
    ejecutar('python3', ['-I', join(aqui, 'docx-indice.py'), salida]);
    console.log(`Manual generado: ${salida}`);
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
} else if (modo === 'web') {
  const carpeta = join(docs, 'manual-usuario', 'web');
  mkdirSync(carpeta, { recursive: true });
  const texto = readFileSync(join(docs, 'manual-usuario.md'), 'utf8');
  const apertura =
    texto.split('\n').find((linea, i, lineas) => i > 0 && linea.trim() && lineas[i - 1] === '') ??
    '';
  writeFileSync(
    join(carpeta, 'metadatos.json'),
    JSON.stringify({ title: 'Manual de usuario', subtitle: apertura }),
  );
  ejecutar('pandoc', [
    join(docs, 'manual-usuario.md'),
    '--from=markdown+pipe_tables+implicit_figures',
    '--to=html5',
    '--standalone',
    `--template=${join(aqui, 'web-plantilla.html')}`,
    `--lua-filter=${join(aqui, 'web-filtro.lua')}`,
    `--metadata-file=${join(carpeta, 'metadatos.json')}`,
    '--toc',
    '--toc-depth=2',
    '--section-divs',
    '--no-highlight',
    `--output=${join(carpeta, 'index.html')}`,
  ]);
  rmSync(join(carpeta, 'metadatos.json'));
  console.log(
    `Página generada: ${join(carpeta, 'index.html')} (las imágenes salen de docs/img/manual)`,
  );
} else if (modo === 'pdf') {
  if (!existsSync(salida)) {
    console.error('Primero genera el .docx con `npm run manual:docx`.');
    process.exit(1);
  }
  const carpeta = join(docs, 'manual-usuario', 'pdf');
  mkdirSync(carpeta, { recursive: true });
  ejecutar('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', carpeta, salida]);
  console.log(`PDF generado en ${carpeta}`);
}
