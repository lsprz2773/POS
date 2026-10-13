#!/usr/bin/env bash
# Prepara AWS CloudShell para desplegar: Node 22 en tu carpeta personal (sin permisos de administrador)
# y las dependencias del repositorio. Se ejecuta desde la carpeta del repositorio clonado.
# CloudShell conserva ~1 GB en tu carpeta personal; este script ocupa unos 500 MB.
set -euo pipefail

major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

if [ "$(major)" -lt 22 ]; then
  ARCH="$(uname -m)"; case "$ARCH" in x86_64) NODE_ARCH=x64 ;; aarch64) NODE_ARCH=arm64 ;; *) echo "Arquitectura no soportada: $ARCH" >&2; exit 1 ;; esac
  VERSION="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o "node-v22[0-9.]*-linux-${NODE_ARCH}.tar.xz" | head -1)"
  echo "Instalando ${VERSION%.tar.xz} en ~/.local/node ..."
  mkdir -p "$HOME/.local/node"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/${VERSION}" | tar -xJ -C "$HOME/.local/node" --strip-components=1
  export PATH="$HOME/.local/node/bin:$PATH"
  grep -q '.local/node/bin' "$HOME/.bashrc" 2>/dev/null || echo 'export PATH="$HOME/.local/node/bin:$PATH"' >>"$HOME/.bashrc"
fi

echo "Node $(node -v)"
# No se necesita el navegador de las pruebas E2E.
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund
echo "Listo. Ejecuta: source ~/.bashrc"
