#!/bin/bash
# YourTM CLI Installer
# Usage: curl -fsSL https://yourtm.dev/install | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

GITHUB_REPO="davecurrier/yourtm"
INSTALL_DIR="$HOME/.yourtm"
LOG="$INSTALL_DIR/install.log"
APP_PATH=""

# Run a build step with its output in $LOG, and show the tail if it fails
# rather than exiting silently.
run_logged() {
  local label="$1"; shift
  if ! "$@" >>"$LOG" 2>&1; then
    echo -e "${RED}✗ ${label} failed.${NC} Last lines of $LOG:"
    tail -n 25 "$LOG"
    exit 1
  fi
}

print_banner() {
  echo ""
  echo -e "${BOLD}┌─────────────────────────────────────┐${NC}"
  echo -e "${BOLD}│         ${CYAN}YourTM CLI Installer${NC}${BOLD}        │${NC}"
  echo -e "${BOLD}└─────────────────────────────────────┘${NC}"
  echo ""
}

check_requirements() {
  # Check for Node.js
  if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is required but not installed.${NC}"
    echo ""
    echo "Install Node.js 18+ from: https://nodejs.org"
    echo ""
    exit 1
  fi

  # Check Node version
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [[ "$NODE_VERSION" -lt 18 ]]; then
    echo -e "${RED}Error: Node.js 18+ required (found v$NODE_VERSION)${NC}"
    echo ""
    echo "Update Node.js from: https://nodejs.org"
    echo ""
    exit 1
  fi

  # Check for npm
  if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is required but not installed.${NC}"
    exit 1
  fi

  # Check for git
  if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: git is required but not installed.${NC}"
    exit 1
  fi
}

install_cli() {
  echo -e "${CYAN}Cloning repository...${NC}"

  # ~/.yourtm holds user data alongside the code: config.json (the app's
  # settings, Cloudflare and WordPress credentials, deployment records),
  # credentials.json and projects/. Never delete the directory; update the code
  # in place and leave those alone.
  local repo_url="${YTM_REPO_URL:-https://github.com/$GITHUB_REPO.git}"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    git -C "$INSTALL_DIR" remote set-url origin "$repo_url"
    git -C "$INSTALL_DIR" fetch --depth 1 --quiet origin main
    git -C "$INSTALL_DIR" reset --hard --quiet FETCH_HEAD
    # -x also removes ignored build output; -e keeps user data.
    git -C "$INSTALL_DIR" clean -fdxq \
      -e /config.json -e /credentials.json -e /projects/ -e /bin/
  else
    local tmp
    tmp="$(mktemp -d)"
    git clone --depth 1 --quiet "$repo_url" "$tmp/yourtm"
    mkdir -p "$INSTALL_DIR"
    cp -R "$tmp/yourtm/." "$INSTALL_DIR/"
    rm -rf "$tmp"
  fi

  cd "$INSTALL_DIR"
  : > "$LOG"

  echo -e "${CYAN}Installing dependencies...${NC}"
  run_logged "npm install" npm install --no-audit --no-fund

  echo -e "${CYAN}Building...${NC}"
  run_logged "Build" npm run build

  # Create bin directory and symlink
  mkdir -p "$INSTALL_DIR/bin"

  # Create wrapper script
  cat > "$INSTALL_DIR/bin/ytm" << 'WRAPPER'
#!/bin/bash
exec node "$HOME/.yourtm/packages/cli/dist/bin.js" "$@"
WRAPPER

  chmod +x "$INSTALL_DIR/bin/ytm"
}

# The native Mac app. Optional: skipped off macOS, below macOS 14, without a
# Swift toolchain, or with YTM_SKIP_APP=1, and a failed app build leaves the CLI
# install in place.
install_app() {
  [[ "$(uname -s)" == "Darwin" ]] || return 0
  if [[ "${YTM_SKIP_APP:-}" == "1" ]]; then
    echo -e "${DIM}Skipping the Mac app (YTM_SKIP_APP=1)${NC}"
    return 0
  fi
  local major
  major="$(sw_vers -productVersion | cut -d. -f1)"
  if (( major < 14 )); then
    echo -e "${YELLOW}Skipping the Mac app: it needs macOS 14 or later.${NC}"
    return 0
  fi
  if ! xcrun --find swift >/dev/null 2>&1; then
    echo -e "${YELLOW}Skipping the Mac app: no Swift toolchain.${NC}"
    echo -e "  Install it with ${CYAN}xcode-select --install${NC}, then re-run this installer."
    return 0
  fi

  echo -e "${CYAN}Building the Mac app...${NC} ${DIM}(the first build takes a few minutes)${NC}"
  if ! (cd "$INSTALL_DIR/packages/macos" && ./build-app.sh) >>"$LOG" 2>&1; then
    echo -e "${YELLOW}The Mac app did not build; the CLI is installed. Details: $LOG${NC}"
    return 0
  fi

  local dest="${YTM_APP_DIR:-/Applications}"
  if [[ ! -w "$dest" ]]; then
    dest="$HOME/Applications"
    mkdir -p "$dest"
  fi
  if pgrep -xq YourTM; then
    osascript -e 'quit app "YourTM"' >/dev/null 2>&1 || true
    sleep 1
  fi
  rm -rf "$dest/YourTM.app"
  ditto "$INSTALL_DIR/packages/macos/dist/YourTM.app" "$dest/YourTM.app"
  APP_PATH="$dest/YourTM.app"
  echo -e "  ${GREEN}✓${NC} Installed $APP_PATH"
}

setup_path() {
  local shell_config=""
  local path_line="export PATH=\"\$HOME/.yourtm/bin:\$PATH\""

  # Detect shell config file
  if [[ "$SHELL" == */zsh ]]; then
    shell_config="$HOME/.zshrc"
  elif [[ "$SHELL" == */bash ]]; then
    if [[ -f "$HOME/.bashrc" ]]; then
      shell_config="$HOME/.bashrc"
    else
      shell_config="$HOME/.bash_profile"
    fi
  elif [[ "$SHELL" == */fish ]]; then
    shell_config="$HOME/.config/fish/config.fish"
    path_line="fish_add_path \$HOME/.yourtm/bin"
  fi

  if [[ -n "$shell_config" ]]; then
    # Only add if not already present
    if ! grep -q "yourtm/bin" "$shell_config" 2>/dev/null; then
      echo "" >> "$shell_config"
      echo "# YourTM CLI" >> "$shell_config"
      echo "$path_line" >> "$shell_config"
      echo -e "${DIM}Added to PATH in $shell_config${NC}"
    fi
  fi

  export PATH="$INSTALL_DIR/bin:$PATH"
}

print_success() {
  echo ""
  echo -e "${GREEN}${BOLD}✓ YourTM CLI installed successfully!${NC}"
  echo ""
  echo -e "  ${CYAN}ytm --help${NC}       Show all commands"
  echo -e "  ${CYAN}ytm init${NC}         Create a new project"
  echo -e "  ${CYAN}ytm create tag${NC}   Create a tag from template"
  if [[ -n "$APP_PATH" ]]; then
    echo -e "  ${CYAN}ytm gui${NC}          Open the YourTM app ($APP_PATH)"
  fi
  echo ""
  echo -e "${YELLOW}Restart your terminal or run:${NC}"
  echo -e "  ${CYAN}source ~/.zshrc${NC}  ${DIM}(or your shell config)${NC}"
  echo ""
}

main() {
  print_banner

  echo -e "${CYAN}Checking requirements...${NC}"
  check_requirements
  echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"
  echo -e "  ${GREEN}✓${NC} npm $(npm -v)"
  echo -e "  ${GREEN}✓${NC} git"
  echo ""

  install_cli
  echo ""

  install_app
  echo ""

  echo -e "${CYAN}Configuring PATH...${NC}"
  setup_path
  echo ""

  print_success
}

main "$@"
