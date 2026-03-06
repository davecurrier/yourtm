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
NC='\033[0m' # No Color

# Config
GITHUB_REPO="yourtm/yourtm-cli"
INSTALL_DIR="${YOURTM_INSTALL_DIR:-$HOME/.yourtm}"
BIN_DIR="$INSTALL_DIR/bin"

# Detect OS and architecture
detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *)
      echo -e "${RED}Error: Unsupported operating system: $OS${NC}"
      exit 1
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)
      echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
      exit 1
      ;;
  esac

  echo "$PLATFORM-$ARCH"
}

# Get latest release version
get_latest_version() {
  curl -fsSL "https://api.github.com/repos/$GITHUB_REPO/releases/latest" |
    grep '"tag_name":' |
    sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and extract
download_and_install() {
  local version="$1"
  local platform="$2"

  echo -e "${CYAN}Downloading YourTM CLI ${version}...${NC}"

  # Create directories
  mkdir -p "$BIN_DIR"

  # Download URL
  local download_url="https://github.com/$GITHUB_REPO/releases/download/${version}/ytm-${platform}.tar.gz"

  # Download and extract
  if command -v curl &> /dev/null; then
    curl -fsSL "$download_url" | tar -xz -C "$INSTALL_DIR"
  elif command -v wget &> /dev/null; then
    wget -qO- "$download_url" | tar -xz -C "$INSTALL_DIR"
  else
    echo -e "${RED}Error: curl or wget is required${NC}"
    exit 1
  fi

  # Make executable
  chmod +x "$BIN_DIR/ytm"

  echo -e "${GREEN}Installed to $BIN_DIR/ytm${NC}"
}

# Add to PATH
setup_path() {
  local shell_profile=""
  local path_export="export PATH=\"$BIN_DIR:\$PATH\""

  # Detect shell
  case "$SHELL" in
    */zsh)  shell_profile="$HOME/.zshrc" ;;
    */bash)
      if [[ -f "$HOME/.bashrc" ]]; then
        shell_profile="$HOME/.bashrc"
      elif [[ -f "$HOME/.bash_profile" ]]; then
        shell_profile="$HOME/.bash_profile"
      fi
      ;;
    */fish)
      shell_profile="$HOME/.config/fish/config.fish"
      path_export="set -gx PATH $BIN_DIR \$PATH"
      ;;
  esac

  if [[ -n "$shell_profile" ]]; then
    # Check if already in profile
    if ! grep -q "/.yourtm/bin" "$shell_profile" 2>/dev/null; then
      echo "" >> "$shell_profile"
      echo "# YourTM CLI" >> "$shell_profile"
      echo "$path_export" >> "$shell_profile"
      echo -e "${CYAN}Added $BIN_DIR to PATH in $shell_profile${NC}"
    fi
  fi
}

# Verify installation
verify_install() {
  if [[ -x "$BIN_DIR/ytm" ]]; then
    echo ""
    echo -e "${GREEN}${BOLD}YourTM CLI installed successfully!${NC}"
    echo ""
    echo -e "Run ${CYAN}ytm --help${NC} to get started."
    echo ""
    echo -e "${YELLOW}Note: You may need to restart your terminal or run:${NC}"
    echo -e "  ${CYAN}source ~/.zshrc${NC}  (or your shell's config file)"
    echo ""
  else
    echo -e "${RED}Installation failed${NC}"
    exit 1
  fi
}

# Main
main() {
  echo ""
  echo -e "${BOLD}YourTM CLI Installer${NC}"
  echo "────────────────────"
  echo ""

  # Check for Node.js (required for now)
  if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Warning: Node.js is required but not found.${NC}"
    echo -e "Install Node.js from https://nodejs.org"
    echo ""
  fi

  local platform=$(detect_platform)
  echo -e "Platform: ${CYAN}$platform${NC}"

  local version="${YOURTM_VERSION:-$(get_latest_version)}"

  # Fallback if GitHub API fails
  if [[ -z "$version" ]]; then
    version="v0.1.0"
  fi

  echo -e "Version:  ${CYAN}$version${NC}"
  echo ""

  download_and_install "$version" "$platform"
  setup_path
  verify_install
}

main "$@"
