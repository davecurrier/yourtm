#!/bin/bash
# YourTM CLI Installer (Simple)
# Usage: curl -fsSL https://yourtm.dev/install | bash
#
# This script downloads the CLI directly from GitHub releases
# and installs it to ~/.yourtm/bin

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

GITHUB_REPO="yourtm/yourtm-cli"
INSTALL_DIR="$HOME/.yourtm"
BIN_DIR="$INSTALL_DIR/bin"
LIB_DIR="$INSTALL_DIR/lib"

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
    echo -e "${YELLOW}Warning: Node.js 18+ recommended (found v$NODE_VERSION)${NC}"
  fi

  # Check for curl or wget
  if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
    echo -e "${RED}Error: curl or wget is required${NC}"
    exit 1
  fi
}

get_latest_version() {
  local version=""

  if command -v curl &> /dev/null; then
    version=$(curl -fsSL "https://api.github.com/repos/$GITHUB_REPO/releases/latest" 2>/dev/null |
      grep '"tag_name":' |
      sed -E 's/.*"v?([^"]+)".*/\1/' |
      head -1)
  elif command -v wget &> /dev/null; then
    version=$(wget -qO- "https://api.github.com/repos/$GITHUB_REPO/releases/latest" 2>/dev/null |
      grep '"tag_name":' |
      sed -E 's/.*"v?([^"]+)".*/\1/' |
      head -1)
  fi

  # Fallback to hardcoded version if API fails
  if [[ -z "$version" ]]; then
    version="0.1.0"
  fi

  echo "$version"
}

download_release() {
  local version="$1"
  local url="https://github.com/$GITHUB_REPO/releases/download/v${version}/yourtm-cli-v${version}.tar.gz"

  echo -e "${DIM}Downloading from: $url${NC}"

  # Create directories
  rm -rf "$INSTALL_DIR"
  mkdir -p "$BIN_DIR" "$LIB_DIR"

  # Download and extract
  if command -v curl &> /dev/null; then
    curl -fsSL "$url" | tar -xz -C "$LIB_DIR" --strip-components=1
  else
    wget -qO- "$url" | tar -xz -C "$LIB_DIR" --strip-components=1
  fi
}

create_executable() {
  # Create the ytm executable wrapper
  cat > "$BIN_DIR/ytm" << 'WRAPPER'
#!/bin/bash
exec node "$HOME/.yourtm/lib/dist/bin.js" "$@"
WRAPPER

  chmod +x "$BIN_DIR/ytm"
}

setup_path() {
  local shell_config=""
  local path_line="export PATH=\"\$HOME/.yourtm/bin:\$PATH\""

  # Detect shell config file
  if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == */zsh ]]; then
    shell_config="$HOME/.zshrc"
  elif [[ -n "$BASH_VERSION" ]] || [[ "$SHELL" == */bash ]]; then
    if [[ -f "$HOME/.bashrc" ]]; then
      shell_config="$HOME/.bashrc"
    elif [[ -f "$HOME/.bash_profile" ]]; then
      shell_config="$HOME/.bash_profile"
    else
      shell_config="$HOME/.bashrc"
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
    else
      echo -e "${DIM}PATH already configured in $shell_config${NC}"
    fi
  fi

  # Also export for current session
  export PATH="$BIN_DIR:$PATH"
}

print_success() {
  local version="$1"

  echo ""
  echo -e "${GREEN}${BOLD}Successfully installed YourTM CLI v${version}${NC}"
  echo ""
  echo -e "  ${CYAN}ytm --version${NC}    Check version"
  echo -e "  ${CYAN}ytm init${NC}         Create a new project"
  echo -e "  ${CYAN}ytm create tag${NC}   Create a tag from template"
  echo -e "  ${CYAN}ytm --help${NC}       Show all commands"
  echo ""
  echo -e "${YELLOW}Restart your terminal or run:${NC}"
  echo -e "  ${CYAN}source ~/.zshrc${NC}  ${DIM}(or your shell config)${NC}"
  echo ""
}

# Main installation flow
main() {
  print_banner

  echo -e "${CYAN}Checking requirements...${NC}"
  check_requirements
  echo -e "  Node.js: ${GREEN}$(node -v)${NC}"
  echo ""

  echo -e "${CYAN}Fetching latest version...${NC}"
  VERSION="${YOURTM_VERSION:-$(get_latest_version)}"
  echo -e "  Version: ${GREEN}v${VERSION}${NC}"
  echo ""

  echo -e "${CYAN}Downloading...${NC}"
  download_release "$VERSION"
  echo -e "  ${GREEN}Downloaded${NC}"
  echo ""

  echo -e "${CYAN}Installing...${NC}"
  create_executable
  echo -e "  ${GREEN}Installed to $BIN_DIR/ytm${NC}"
  echo ""

  echo -e "${CYAN}Configuring PATH...${NC}"
  setup_path
  echo ""

  print_success "$VERSION"
}

main "$@"
