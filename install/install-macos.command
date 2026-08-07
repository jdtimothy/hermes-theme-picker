#!/bin/sh
# Installs the Theme Picker desktop plugin into the active macOS Hermes home.
# Double-click this .command file in Finder, or run it from Terminal.
set -eu

installer_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(dirname -- "$installer_dir")

# Support both layouts:
# - a source checkout: <repo>/plugin/plugin.js
# - a small distributable bundle: <bundle>/theme-picker/plugin.js
checkout_plugin="$repo_root/plugin/plugin.js"
bundled_plugin="$installer_dir/theme-picker/plugin.js"
if [ -f "$checkout_plugin" ]; then
  source_plugin=$checkout_plugin
elif [ -f "$bundled_plugin" ]; then
  source_plugin=$bundled_plugin
else
  printf 'Theme Picker plugin file was not found.\nExpected: %s\nOr: %s\n' \
    "$checkout_plugin" "$bundled_plugin" >&2
  exit 1
fi

hermes_home=${HERMES_HOME:-"$HOME/.hermes"}
plugin_dir="$hermes_home/desktop-plugins/theme-picker"
installed_plugin="$plugin_dir/plugin.js"

mkdir -p "$plugin_dir"
cp "$source_plugin" "$installed_plugin"

printf '\nInstalled Theme Picker into: %s\n' "$plugin_dir"
printf 'Now open the Command Palette in Hermes Desktop and run: Reload desktop plugins\n'
printf '(or fully quit and relaunch Hermes Desktop).\n'
