#!/bin/sh
set -eu

fail() { printf 'PointDOM: %s\n' "$*" >&2; exit 1; }
download() { curl --fail --location --silent --show-error --retry 2 "$1" -o "$2"; }
checksum() {
  expected=$(awk -v file="$2" '$2 == file { print $1 }' "$3")
  [ "${#expected}" -eq 64 ] || fail '下载文件缺少有效的 SHA-256 校验值'
  actual=$(shasum -a 256 "$1" | awk '{print $1}')
  [ "$actual" = "$expected" ] || fail '下载文件校验失败，未安装'
}

print_path_commands() {
  cat <<'COMMANDS'

在当前终端启用 pdo：
  export PATH="$HOME/.local/bin:$PATH"

永久添加到 PATH（根据使用的 shell 选择一组）：
  # zsh
  printf '%s\n' 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
  source "$HOME/.zshrc"

  # bash（macOS 登录终端）
  printf '%s\n' 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bash_profile"
  source "$HOME/.bash_profile"
COMMANDS
}

[ "$(uname -s)" = Darwin ] || fail '自动安装目前支持 macOS'
case "$(uname -m)" in
  arm64) arch=arm64 ;;
  x86_64) arch=x64 ;;
  *) fail '不支持的 CPU 架构' ;;
esac
for dependency in curl tar shasum awk; do
  command -v "$dependency" >/dev/null 2>&1 || fail "缺少命令：$dependency"
done
command -v opencode >/dev/null 2>&1 || fail '请先安装并配置 OpenCode CLI，再运行本安装器'
[ ! -f "$HOME/Library/LaunchAgents/dev.pointdom.bridge.plist" ] || {
  printf 'PointDOM 后台服务已安装。新增项目请执行 ~/.local/bin/pdo link --origin 网页地址\n'
  print_path_commands
  exit 0
}

base="$HOME/.local/share/pointdom"
mkdir -p "$base"
staging=$(mktemp -d "$base/.install.XXXXXX")
cleanup() { rm -rf "$staging"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
release_url=${POINTDOM_RELEASE_BASE_URL:-https://github.com/itscyrus-dev/PointDOM/releases/latest/download}
printf '下载 PointDOM…\n'
download "$release_url/pointdom.tar.gz" "$staging/pointdom.tar.gz"
download "$release_url/SHA256SUMS" "$staging/SHA256SUMS"
checksum "$staging/pointdom.tar.gz" pointdom.tar.gz "$staging/SHA256SUMS"
# Extract only the expected application subtree, without absolute/traversal paths.
tar -tzf "$staging/pointdom.tar.gz" > "$staging/files"
awk '/^\// || /(^|\/)\.\.(\/|$)/ || !/^pointdom\// { invalid=1 } END { exit invalid }' "$staging/files" || fail '安装包包含无效路径'
tar -xzf "$staging/pointdom.tar.gz" -C "$staging"
[ -f "$staging/pointdom/dist/bridge/main.js" ] && [ -f "$staging/pointdom/dist/extension/manifest.json" ] || fail '安装包不完整'

node_bin=''
if command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  node_bin=$(command -v node)
else
  node_version=v24.13.0
  node_archive="node-$node_version-darwin-$arch.tar.gz"
  runtime="$base/runtime/node-$node_version-darwin-$arch"
  if [ ! -x "$runtime/bin/node" ]; then
    printf '安装 PointDOM 专用 Node.js 24…\n'
    download "https://nodejs.org/dist/$node_version/$node_archive" "$staging/$node_archive"
    download "https://nodejs.org/dist/$node_version/SHASUMS256.txt" "$staging/node-shasums"
    checksum "$staging/$node_archive" "$node_archive" "$staging/node-shasums"
    mkdir -p "$base/runtime"
    tar -xzf "$staging/$node_archive" -C "$base/runtime"
  fi
  node_bin="$runtime/bin/node"
fi

version=$("$node_bin" -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(!/^\d+\.\d+\.\d+([+-][a-zA-Z0-9.-]+)?$/.test(p.version))process.exit(1); process.stdout.write(p.version)' "$staging/pointdom/package.json")
# Never replace files used by an existing task or prior installation.
mkdir -p "$base/versions"
app=$(mktemp -d "$base/versions/$version.XXXXXX")
cp -R "$staging/pointdom/." "$app/"
if ! "$node_bin" "$app/dist/bridge/main.js" install; then
  fail "后台安装未完成。文件保留在 $app，请检查已有服务及端口 4318"
fi

printf '\nPointDOM %s 已安装，后台服务已启动。\n' "$version"
print_path_commands
printf 'Chrome 加载已解压扩展的目录：\n%s/dist/extension\n' "$app"
printf '\n首次执行 ~/.local/bin/pdo pair，在插件中输入配对码并选择 OpenCode CLI。\n'
printf '每个项目绑定一次：\n  cd /你的项目目录\n  ~/.local/bin/pdo link --origin http://localhost:5173\n'
printf '以后运行项目的 pnpm dev 即可在插件里发送修改。\n'
