#!/bin/sh
set -eu

upgrade=false
case "${1:-}" in
  '') ;;
  --upgrade) upgrade=true ;;
  *) printf 'Usage: install.sh [--upgrade]\n' >&2; exit 1 ;;
esac

# Keep redirected output plain; respect NO_COLOR in interactive terminals.
bold='' green='' dim='' reset=''
if [ -t 1 ] && [ -z "${NO_COLOR+x}" ] && [ "${TERM:-dumb}" != dumb ]; then
  bold=$(printf '\033[1m'); green=$(printf '\033[32m')
  dim=$(printf '\033[2m'); reset=$(printf '\033[0m')
fi
step() { printf '  %s%s%s  %s\n' "$dim" "$1" "$reset" "$2"; }
fail() { printf '\n  Error: %s\n' "$*" >&2; exit 1; }
download() {
  curl --fail --location --silent --show-error --retry 2 "$1" -o "$2" ||
    fail "Could not download $(basename "$2"). Check your connection and try again."
}
checksum() {
  expected=$(awk -v file="$2" '$2 == file { print $1 }' "$3")
  [ "${#expected}" -eq 64 ] || fail 'Missing or invalid SHA-256 checksum. Nothing was installed.'
  actual=$(shasum -a 256 "$1" | awk '{print $1}')
  [ "$actual" = "$expected" ] || fail 'Checksum mismatch. Nothing was installed.'
}

print_path_commands() {
  case ":${PATH:-}:" in *":$HOME/.local/bin:"*) return ;; esac
  printf '\n  Enable pdo in this terminal:\n    export PATH="$HOME/.local/bin:$PATH"\n'
  case "${SHELL:-}" in
    */zsh) profile='.zshrc' ;;
    */bash) profile='.bash_profile' ;;
    *) printf '\n  Add the same PATH setting to your shell profile to keep it.\n'; return ;;
  esac
  printf '\n  Keep it for new terminals (%s):\n' "${SHELL##*/}"
  printf '    printf '\''%%s\\n'\'' '\''export PATH="$HOME/.local/bin:$PATH"'\'' >> "$HOME/%s"\n' "$profile"
}

printf '\n  %sPointDOM%s\n  %sLocal coding agents, connected to your browser.%s\n\n' "$bold" "$reset" "$dim" "$reset"
[ "$(uname -s)" = Darwin ] || fail 'This installer supports macOS only. See the source installation guide for other platforms.'
case "$(uname -m)" in
  arm64) arch=arm64 ;;
  x86_64) arch=x64 ;;
  *) fail 'Unsupported CPU architecture. Use an Apple Silicon or Intel Mac.' ;;
esac
for dependency in curl tar shasum awk; do
  command -v "$dependency" >/dev/null 2>&1 || fail "Missing command: $dependency. Install it and try again."
done
if [ -f "$HOME/Library/LaunchAgents/dev.pointdom.bridge.plist" ] && [ "$upgrade" = false ]; then
  printf '  PointDOM is already installed. No changes made.\n'
  print_path_commands
  printf '\n  Check service:  ~/.local/bin/pdo status\n  Link a project: ~/.local/bin/pdo link --origin http://localhost:5173\n'
  printf '\n  To update: run ~/.local/bin/pdo upgrade after active tasks finish.\n\n'
  exit 0
fi
command -v opencode >/dev/null 2>&1 || fail 'Install and configure OpenCode CLI first, then rerun this installer. See https://opencode.ai'

base="$HOME/.local/share/pointdom"
mkdir -p "$base"
staging=$(mktemp -d "$base/.install.XXXXXX")
stopped=false
cleanup() {
  if [ "$stopped" = true ]; then
    printf '\n  Restoring the previous background service...\n' >&2
    "$POINTDOM_UPGRADE_NODE" "$POINTDOM_UPGRADE_CLI" uninstall >/dev/null 2>&1 || true
    "$POINTDOM_UPGRADE_NODE" "$POINTDOM_UPGRADE_CLI" install --quiet ||
      printf '  Restore failed. Run ~/.local/bin/pdo install to recover.\n' >&2
  fi
  rm -rf "$staging"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
release_url=${POINTDOM_RELEASE_BASE_URL:-https://github.com/itscyrus-dev/PointDOM/releases/latest/download}
step '1/4' 'Downloading PointDOM...'
download "$release_url/pointdom.tar.gz" "$staging/pointdom.tar.gz"
download "$release_url/SHA256SUMS" "$staging/SHA256SUMS"
step '2/4' 'Verifying package...'
checksum "$staging/pointdom.tar.gz" pointdom.tar.gz "$staging/SHA256SUMS"
# Extract only the expected application subtree, without absolute/traversal paths.
tar -tzf "$staging/pointdom.tar.gz" > "$staging/files"
awk '/^\// || /(^|\/)\.\.(\/|$)/ || !/^pointdom\// { invalid=1 } END { exit invalid }' "$staging/files" || fail 'Invalid paths in the package. Nothing was installed.'
tar -xzf "$staging/pointdom.tar.gz" -C "$staging"
[ -f "$staging/pointdom/dist/bridge/main.js" ] && [ -f "$staging/pointdom/dist/extension/manifest.json" ] || fail 'Incomplete package. Nothing was installed.'

step '3/4' 'Preparing Node.js runtime...'
node_bin=''
if command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  node_bin=$(command -v node)
else
  node_version=v24.13.0
  node_archive="node-$node_version-darwin-$arch.tar.gz"
  runtime="$base/runtime/node-$node_version-darwin-$arch"
  if [ ! -x "$runtime/bin/node" ]; then
    printf '       Downloading a private Node.js 24 runtime...\n'
    download "https://nodejs.org/dist/$node_version/$node_archive" "$staging/$node_archive"
    download "https://nodejs.org/dist/$node_version/SHASUMS256.txt" "$staging/node-shasums"
    checksum "$staging/$node_archive" "$node_archive" "$staging/node-shasums"
    mkdir -p "$base/runtime"
    tar -xzf "$staging/$node_archive" -C "$base/runtime"
  fi
  node_bin="$runtime/bin/node"
fi

version=$("$node_bin" -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(!/^\d+\.\d+\.\d+([+-][a-zA-Z0-9.-]+)?$/.test(p.version))process.exit(1); process.stdout.write(p.version)' "$staging/pointdom/package.json")
if [ "$upgrade" = true ]; then
  [ -n "${POINTDOM_UPGRADE_NODE:-}" ] && [ -n "${POINTDOM_UPGRADE_CLI:-}" ] || fail 'Run pdo upgrade instead of calling --upgrade directly.'
  current=$("$POINTDOM_UPGRADE_NODE" "$POINTDOM_UPGRADE_CLI" version)
  if [ "$current" = "pdo $version" ]; then
    printf '\n  PointDOM %s is already up to date.\n\n' "$version"
    exit 0
  fi
fi
# Never replace files used by an existing task or prior installation.
mkdir -p "$base/versions"
app=$(mktemp -d "$base/versions/$version.XXXXXX")
cp -R "$staging/pointdom/." "$app/"
if [ "$upgrade" = true ]; then
  "$POINTDOM_UPGRADE_NODE" "$POINTDOM_UPGRADE_CLI" upgrade-stop || fail 'Upgrade paused. The previous installation was not replaced.'
  stopped=true
fi
step '4/4' 'Starting background service...'
if ! "$node_bin" "$app/dist/bridge/main.js" install --quiet; then
  fail "Service setup did not complete. Files are preserved at $app. Check pdo status and port 4318 before retrying."
fi

stopped=false
printf '\n  %sPointDOM %s is ready.%s Background service started.\n' "$green" "$version" "$reset"
print_path_commands
printf '\n  %sNext steps%s\n\n' "$bold" "$reset"
printf '  1. Load the Chrome extension\n     Open chrome://extensions, enable Developer mode, choose Load unpacked:\n     %s/dist/extension\n' "$app"
printf '\n  2. Pair the extension\n     Run ~/.local/bin/pdo pair and paste the code into the extension settings.\n     Choose OpenCode CLI and allow access to your development site.\n'
printf '\n  3. Link your project (once per project)\n     cd /path/to/your/project\n     ~/.local/bin/pdo link --origin http://localhost:5173\n'
printf '\n  Start your app as usual, then select an element and describe a change.\n  Help: ~/.local/bin/pdo help\n\n'
