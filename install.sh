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

  # Remove existing installation
  rm -rf "$INSTALL_DIR"

  # Clone the repo
  git clone --depth 1 "https://github.com/$GITHUB_REPO.git" "$INSTALL_DIR" 2>/dev/null

  echo -e "${CYAN}Installing dependencies...${NC}"
  cd "$INSTALL_DIR"
  npm install --silent 2>/dev/null

  echo -e "${CYAN}Building...${NC}"
  npm run build --silent 2>/dev/null

  # Create bin directory and symlink
  mkdir -p "$INSTALL_DIR/bin"

  # Create wrapper script
  cat > "$INSTALL_DIR/bin/ytm" << 'WRAPPER'
#!/bin/bash
exec node "$HOME/.yourtm/packages/cli/dist/bin.js" "$@"
WRAPPER

  chmod +x "$INSTALL_DIR/bin/ytm"
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

  echo -e "${CYAN}Configuring PATH...${NC}"
  setup_path
  echo ""

  print_success
}

main "$@"
