import chalk from 'chalk';

export const logger = {
  // Basic logging
  info: (message: string) => {
    console.log(chalk.blue('info') + '  ' + message);
  },

  success: (message: string) => {
    console.log(chalk.green('success') + ' ' + message);
  },

  warn: (message: string) => {
    console.log(chalk.yellow('warn') + '  ' + message);
  },

  error: (message: string) => {
    console.log(chalk.red('error') + ' ' + message);
  },

  debug: (message: string) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray('debug') + ' ' + message);
    }
  },

  // Styled output
  header: (text: string) => {
    console.log();
    console.log(chalk.bold.magenta(text));
    console.log(chalk.magenta('-'.repeat(text.length)));
  },

  // Build output
  bundle: (name: string, size: number) => {
    const sizeStr = formatBytes(size);
    const sizeColor = size > 50000 ? chalk.red : size > 20000 ? chalk.yellow : chalk.green;
    console.log(
      chalk.gray('  ') +
      chalk.cyan(name.padEnd(40)) +
      sizeColor(sizeStr.padStart(10))
    );
  },

  // File operations
  file: (action: 'create' | 'update' | 'delete', path: string) => {
    const colors = {
      create: chalk.green,
      update: chalk.yellow,
      delete: chalk.red,
    };
    console.log(colors[action](action.padEnd(8)) + chalk.gray(path));
  },

  // Tag status
  tag: (name: string, status: 'fired' | 'blocked' | 'error', latency?: number) => {
    const statusColors = {
      fired: chalk.green,
      blocked: chalk.yellow,
      error: chalk.red,
    };
    const statusIcon = {
      fired: '✓',
      blocked: '○',
      error: '✗',
    };
    const latencyStr = latency !== undefined ? chalk.gray(` ${latency}ms`) : '';
    console.log(
      statusColors[status](statusIcon[status]) +
      ' ' +
      name +
      latencyStr
    );
  },

  // Progress indicators
  step: (current: number, total: number, message: string) => {
    const progress = chalk.gray(`[${current}/${total}]`);
    console.log(`${progress} ${message}`);
  },

  // Table-like output
  table: (rows: Array<{ label: string; value: string }>) => {
    const maxLabelLength = Math.max(...rows.map(r => r.label.length));
    rows.forEach(({ label, value }) => {
      console.log(
        chalk.gray('  ') +
        chalk.white(label.padEnd(maxLabelLength + 2)) +
        chalk.cyan(value)
      );
    });
  },

  // Divider
  divider: () => {
    console.log(chalk.gray('-'.repeat(50)));
  },

  // Blank line
  newline: () => {
    console.log();
  },

  // Raw chalk for custom styling
  chalk,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export type Logger = typeof logger;
