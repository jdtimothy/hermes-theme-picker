#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BUNDLE_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
HERMES_DIR=${HERMES_HOME:-"$HOME/.hermes"}
DESTINATION="$HERMES_DIR/skins"
force=0

case "${1:-}" in
  '') ;;
  --force) force=1 ;;
  *) printf 'Usage: %s [--force]\n' "$0" >&2; exit 2 ;;
esac

mkdir -p "$DESTINATION"

# Never follow a destination symlink, including with --force. The bundle owns
# regular skin files only and must not be able to overwrite an external target.
for source_dir in "$BUNDLE_DIR/skins" "$BUNDLE_DIR/gateway-skins"; do
  [ -d "$source_dir" ] || { printf 'Missing required skin directory: %s\n' "$source_dir" >&2; exit 1; }
  for source in "$source_dir"/*.yaml; do
    [ -f "$source" ] || continue
    target="$DESTINATION/$(basename -- "$source")"
    if [ -L "$target" ]; then
      printf 'Refusing destination symlink: %s\n' "$target" >&2
      exit 1
    fi
  done
done

if [ "$force" -eq 0 ]; then
  collisions=''
  for source_dir in "$BUNDLE_DIR/skins" "$BUNDLE_DIR/gateway-skins"; do
    [ -d "$source_dir" ] || { printf 'Missing required skin directory: %s\n' "$source_dir" >&2; exit 1; }
    for source in "$source_dir"/*.yaml; do
      [ -f "$source" ] || continue
      target="$DESTINATION/$(basename -- "$source")"
      if [ -f "$target" ] && ! cmp -s "$source" "$target"; then
        collisions="$collisions\n  $target"
      fi
    done
  done
  if [ -n "$collisions" ]; then
    printf 'Refusing to overwrite modified gateway skins:%b\n' "$collisions" >&2
    printf 'Review the files, back them up, then rerun with --force if replacement is intended.\n' >&2
    exit 1
  fi
fi

count=0
for source_dir in "$BUNDLE_DIR/skins" "$BUNDLE_DIR/gateway-skins"; do
  if [ ! -d "$source_dir" ]; then
    printf 'Missing required skin directory: %s\n' "$source_dir" >&2
    exit 1
  fi
  for source in "$source_dir"/*.yaml; do
    [ -f "$source" ] || continue
    target="$DESTINATION/$(basename -- "$source")"
    if [ ! -f "$target" ] || ! cmp -s "$source" "$target"; then
      cp "$source" "$target"
    fi
    count=$((count + 1))
  done
done

printf 'Installed %s Theme Picker gateway skins into: %s\n' "$count" "$DESTINATION"
printf 'The next config.set skin request can resolve them without restarting Hermes Desktop.\n'
