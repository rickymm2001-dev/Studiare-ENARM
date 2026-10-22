#!/usr/bin/env bash
# Borra los despliegues de vista previa viejos de Cloudflare Pages (B17, 1.5 del plan de B17). Cada pull request del
# mismo repositorio publica una vista previa y Cloudflare no las limpia solas. NO corre solo: lo corres tú, a mano,
# cuando quieras limpiar. Por omisión solo muestra qué borraría; para borrar de verdad hay que pasar --apply.
#
# Uso
#   bash scripts/deploy/prune-previews.sh [--keep N] [--apply]
#     --keep N   cuántas vistas previas, las más nuevas, se conservan. Por omisión 10
#     --apply    borra de verdad. Sin esto solo imprime la lista
# Necesita en el entorno CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID (los mismos del flujo cloudflare, con el
# permiso Account, Cloudflare Pages, Edit) y, si el proyecto no se llama studiare, CLOUDFLARE_PAGES_PROJECT.
#
# Solo toca el ambiente preview: pide a wrangler solo esa lista y vuelve a revisar cada renglón, así que un
# despliegue de producción nunca se borra, ni siquiera por un error. wrangler se baja con npx y versión exacta, como
# en el flujo, sin instalar nada. Borra con --force porque la vista previa más nueva de cada rama lleva un alias, y
# wrangler no borra un despliegue con alias sin eso. Recetas de wrangler pages deployment list y delete.
set -euo pipefail

WRANGLER="wrangler@4.146.0"
keep=10
apply=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --keep)
      if [ "$#" -lt 2 ]; then echo "--keep necesita un número" >&2; exit 2; fi
      keep="$2"
      shift 2
      ;;
    --apply)
      apply=true
      shift
      ;;
    *)
      echo "No conozco la opción $1. Uso: bash scripts/deploy/prune-previews.sh [--keep N] [--apply]" >&2
      exit 2
      ;;
  esac
done

if ! [[ "$keep" =~ ^[0-9]{1,4}$ ]]; then
  echo "--keep debe ser un número entero, por ejemplo 10" >&2
  exit 2
fi

project="${CLOUDFLARE_PAGES_PROJECT:-studiare}"
if ! [[ "$project" =~ ^[a-z0-9]([a-z0-9-]{0,56}[a-z0-9])?$ ]]; then
  echo "CLOUDFLARE_PAGES_PROJECT no es un nombre de proyecto válido (minúsculas, números y guiones)" >&2
  exit 2
fi

missing=0
for name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
  if [ -z "${!name:-}" ]; then
    echo "Falta la variable de entorno $name" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then exit 2; fi

export WRANGLER_SEND_METRICS=false

listing="$(npx --yes "$WRANGLER" pages deployment list --project-name "$project" --environment preview --json)" || {
  echo "No se pudo leer la lista de despliegues de Cloudflare" >&2
  exit 1
}

# wrangler lista del más nuevo al más viejo. Se conservan los primeros N y el resto se propone para borrar.
# Cada renglón sale como "ID<tab>rama", y solo si es un ID válido y del ambiente preview
old="$(printf '%s' "$listing" | KEEP="$keep" node --input-type=module -e '
  let text = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { text += chunk; });
  process.stdin.on("end", () => {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) process.exit(3);
    const keep = Number(process.env.KEEP);
    for (const row of rows.slice(keep)) {
      const id = String(row.Id ?? "");
      const environment = String(row.Environment ?? "").toLowerCase();
      const branch = String(row.Branch ?? "").replace(/[^A-Za-z0-9._\/-]/g, "?");
      if (environment === "preview" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) {
        console.log(id + "\t" + branch);
      }
    }
  });
')" || {
  echo "La lista de Cloudflare no tiene el formato esperado" >&2
  exit 1
}

if [ -z "$old" ]; then
  echo "No hay vistas previas de sobra: se conservan hasta $keep y no hay más."
  exit 0
fi

count="$(printf '%s\n' "$old" | wc -l | tr -d ' ')"
if [ "$apply" != true ]; then
  echo "Borraría $count vistas previas viejas de $project (se conservan las $keep más nuevas)."
  printf '%s\n' "$old" | while IFS=$'\t' read -r id branch; do echo "  $id  $branch"; done
  echo "No se borró nada. Para borrar de verdad vuelve a correrlo con --apply."
  exit 0
fi

failed=0
deleted=0
while IFS=$'\t' read -r id branch; do
  if npx --yes "$WRANGLER" pages deployment delete "$id" --project-name "$project" --force > /dev/null; then
    deleted=$((deleted + 1))
    echo "Borrada $id  $branch"
  else
    failed=$((failed + 1))
    echo "No se pudo borrar $id  $branch" >&2
  fi
done <<< "$old"

echo "Listo. Borradas $deleted de $count, con $failed fallas."
if [ "$failed" -ne 0 ]; then exit 1; fi
