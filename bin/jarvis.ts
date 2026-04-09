#!/usr/bin/env bun
/**
 * J.A.R.V.I.S. CLI Entry Point
 *
 * Usage:
 *   jarvis start [--port N] [-d|--detach]   Start the daemon
 *   jarvis stop                             Stop the running daemon
 *   jarvis status                           Show daemon status
 *   jarvis onboard                          Interactive setup wizard
 *   jarvis doctor                           Check environment & connectivity
 *   jarvis version                          Print version
 *   jarvis help                             Show this help
 */

import { join } from 'node:path';
import { readFileSync, existsSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { acquireLock, releaseLock, isLocked, getLogPath } from '../src/daemon/pid.ts';
import { c } from '../src/cli/helpers.ts';

const PACKAGE_ROOT = join(import.meta.dir, '..');

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function printHelp(): void {
  console.log(`
${c.cyan('J.A.R.V.I.S.')} ${c.dim(`v${getVersion()}`)}
Just A Rather Very Intelligent System

${c.bold('Usage:')}
  jarvis <command> [options]

${c.bold('Commands:')}
  ${c.cyan('start')}     Start the JARVIS daemon
  ${c.cyan('stop')}      Stop the running daemon
  ${c.cyan('restart')}   Restart the daemon (stop + start)
  ${c.cyan('status')}    Show daemon status
  ${c.cyan('logs')}      Tail the daemon log file
  ${c.cyan('update')}    Update JARVIS to the latest version
  ${c.cyan('onboard')}   Interactive first-time setup wizard
  ${c.cyan('doctor')}    Check environment and connectivity
  ${c.cyan('version')}   Print version number
  ${c.cyan('help')}      Show this help message

${c.bold('Start options:')}
  --port <N>        Override daemon port (default: 3142)
  -d, --detach      Run as background daemon
  --no-open         Don't auto-open dashboard in browser
  --data-dir <path> Override data directory (default: ~/.jarvis)
  --no-local-tools  Disable local tool execution (Docker/headless mode)

${c.bold('Logs options:')}
  -f, --follow      Follow log output (like tail -f)
  -n, --lines <N>   Number of lines to show (default: 50)

${c.bold('Examples:')}
  jarvis start                  Start in foreground
  jarvis start -d               Start as background daemon
  jarvis start --port 8080      Start on custom port
  jarvis restart                Restart with same settings
  jarvis logs -f                Follow live log output
  jarvis update                 Update to latest version
  jarvis onboard                Run the setup wizard
  jarvis doctor                 Check if everything is working
`);
}

async function cmdStart(args: string[]): Promise<void> {
  const detach = args.includes('--detach') || args.includes('-d');
  const noOpen = args.includes('--no-open');
  const noLocalTools = args.includes('--no-local-tools');

  // Parse --port
  let port: number | undefined;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    port = parseInt(args[portIdx + 1]!, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(c.red('Error: --port requires a number between 1 and 65535'));
      process.exit(1);
    }
  }

  // Parse --data-dir
  let dataDir: string | undefined;
  const dataDirIdx = args.indexOf('--data-dir');
  if (dataDirIdx !== -1 && args[dataDirIdx + 1]) {
    dataDir = args[dataDirIdx + 1]!;
  }

  if (!detach) {
    // Run in foreground â€” acquire lock atomically (checks + locks in one step)
    if (!acquireLock(process.pid)) {
      console.log(c.yellow('JARVIS is already running'));
      console.log(c.dim('  Stop it first with: jarvis stop'));
      process.exit(1);
    }
    process.on('exit', () => releaseLock());
    process.on('SIGINT', () => { releaseLock(); process.exit(0); });
    process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

    const { startDaemon } = await import('../src/daemon/index.ts');
    await startDaemon({ port, dataDir, noLocalTools });

    if (!noOpen) {
      openDashboard(port ?? 3142);
    }
  } else {
    // Check if already running before spawning detached child
    const existingPid = isLocked();
    if (existingPid) {
      console.log(c.yellow(`JARVIS is already running (PID ${existingPid})`));
      console.log(c.dim('  Stop it first with: jarvis stop'));
      process.exit(1);
    }

    // Run in background â€” spawn a detached child process with log file
    console.log(c.cyan('Starting J.A.R.V.I.S. daemon...'));

    const logPath = getLogPath();
    const logFile = Bun.file(logPath);

    const daemonArgs = [join(PACKAGE_ROOT, 'bin/jarvis.ts'), 'start', '--no-open'];
    if (port) daemonArgs.push('--port', String(port));

    const logFd = openSync(logPath, 'a');
    const child = spawn('bun', daemonArgs, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
    });
    child.unref();

    // Poll for the daemon to acquire its lock (up to 10s)
    let runningPid: number | null = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      runningPid = isLocked();
      if (runningPid) break;
    }

    if (runningPid) {
      console.log(c.green(`âœ“ JARVIS daemon started (PID ${runningPid})`));
      console.log(c.dim(`  Dashboard: http://localhost:${port ?? 3142}`));
      console.log(c.dim(`  Logs:      ${logPath}`));
      console.log(c.dim(`  Stop with: jarvis stop`));

      if (!noOpen) {
        openDashboard(port ?? 3142);
      }
    } else {
      console.log(c.red('âœ— Failed to start daemon. Check logs:'));
      console.log(c.dim(`  ${logPath}`));
      process.exit(1);
    }
  }
}

async function cmdStop(): Promise<void> {
  const pid = isLocked();
  if (!pid) {
    console.log(c.yellow('JARVIS is not running.'));
    return;
  }

  console.log(c.cyan(`Stopping JARVIS daemon (PID ${pid})...`));
  try {
    process.kill(pid, 'SIGTERM');

    // Wait up to 5s for graceful shutdown, then SIGKILL
    let alive = true;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      try { process.kill(pid, 0); } catch { alive = false; break; }
    }

    if (alive) {
      console.log(c.dim('  Process still alive, sending SIGKILL...'));
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }

    releaseLock();
    console.log(c.green('âœ“ JARVIS daemon stopped.'));
  } catch (err) {
    console.error(c.red(`Failed to stop process ${pid}: ${err}`));
    releaseLock();
  }
}

function cmdStatus(): void {
  const pid = isLocked();
  if (pid) {
    console.log(`${c.green('â—')} JARVIS is ${c.green('running')} (PID ${pid})`);

    // Try to read the port from config
    try {
      const { homedir } = require('node:os');
      const configPath = join(homedir(), '.jarvis', 'config.yaml');
      const YAML = require('yaml');
      const text = readFileSync(configPath, 'utf-8');
      const cfg = YAML.parse(text);
      const port = cfg?.daemon?.port ?? 3142;
      console.log(c.dim(`  Dashboard: http://localhost:${port}`));
    } catch {
      console.log(c.dim(`  Dashboard: http://localhost:3142`));
    }

    console.log(c.dim(`  Stop with: jarvis stop`));
  } else {
    console.log(`${c.red('â—')} JARVIS is ${c.red('stopped')}`);
    console.log(c.dim(`  Start with: jarvis start`));
  }
}

async function cmdOnboard(): Promise<void> {
  const { runOnboard } = await import('../src/cli/onboard.ts');
  await runOnboard();
}

async function cmdDoctor(): Promise<void> {
  const { runDoctor } = await import('../src/cli/doctor.ts');
  await runDoctor();
}

async function cmdRestart(args: string[]): Promise<void> {
  const pid = isLocked();
  if (pid) {
    await cmdStop();
  }

  console.log('');
  await cmdStart(args);
}

function cmdLogs(args: string[]): void {
  const logPath = getLogPath();

  if (!existsSync(logPath)) {
    console.log(c.yellow('No log file found. Start the daemon first: jarvis start'));
    return;
  }

  const follow = args.includes('-f') || args.includes('--follow');

  // Parse --lines / -n
  let lines = 50;
  const nIdx = args.indexOf('-n') !== -1 ? args.indexOf('-n') : args.indexOf('--lines');
  if (nIdx !== -1 && args[nIdx + 1]) {
    const n = parseInt(args[nIdx + 1], 10);
    if (!isNaN(n) && n > 0) lines = n;
  }

  console.log(c.dim(`Log file: ${logPath}\n`));

  if (follow) {
    // tail -f equivalent
    const tailProc = Bun.spawn(['tail', '-f', '-n', String(lines), logPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    process.on('SIGINT', () => {
      tailProc.kill();
      process.exit(0);
    });
  } else {
    // Just show last N lines
    const tailProc = Bun.spawnSync(['tail', '-n', String(lines), logPath]);
    process.stdout.write(tailProc.stdout);
  }
}

function isGitRepo(dir: string): boolean {
  const result = Bun.spawnSync(['git', 'rev-parse', '--is-inside-work-tree'], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  return result.exitCode === 0;
}

function isContainerRuntime(): boolean {
  return existsSync('/.dockerenv') || existsSync('/run/.containerenv');
}

function getUpdateSourceDir(): string | null {
  if (isGitRepo(PACKAGE_ROOT)) {
    return PACKAGE_ROOT;
  }

  const installDir = join(require('node:os').homedir(), '.jarvis', 'daemon');
  if (isGitRepo(installDir)) {
    return installDir;
  }

  return null;
}

function parseVersion(v: string): number[] {
  const cleaned = String(v).trim().replace(/^v/i, '').split(/[+-]/)[0] || '0.0.0';
  const [major, minor, patch] = cleaned.split('.').map((p) => Number.parseInt(p, 10) || 0);
  return [major, minor, patch];
}

function isVersionGreater(a: string, b: string): boolean {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (av[i]! > bv[i]!) return true;
    if (av[i]! < bv[i]!) return false;
  }
  return false;
}

function getLatestGitHubReleaseTag(): string | null {
  const curl = Bun.spawnSync([
    'curl',
    '-fsSL',
    'https://api.github.com/repos/vierisid/jarvis/releases/latest',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  if (curl.exitCode !== 0) {
    return null;
  }

  try {
    const body = JSON.parse(curl.stdout.toString());
    const tag = String(body?.tag_name ?? '').trim();
    return tag || null;
  } catch {
    return null;
  }
}

function getGitStatusPorcelain(dir: string): string[] {
  const result = Bun.spawnSync(['git', 'status', '--porcelain'], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .toString()
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean);
}

async function handleLocalChangesBeforeUpdate(sourceDir: string): Promise<boolean> {
  const changes = getGitStatusPorcelain(sourceDir);
  if (changes.length === 0) {
    return true;
  }

  console.log(c.yellow('\n! Local feature/code changes detected in your installation:'));
  const preview = changes.slice(0, 10);
  for (const line of preview) {
    console.log(c.dim(`  ${line}`));
  }
  if (changes.length > preview.length) {
    console.log(c.dim(`  ...and ${changes.length - preview.length} more`));
  }

  if (!process.stdin.isTTY) {
    console.log(c.red('âœ— Non-interactive shell: update cancelled to protect your local changes.'));
    console.log(c.dim('  Re-run interactively and choose: [S]tash, [R]eplace local edits, or [D]iscard update.'));
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('');
    console.log(c.bold('Choose how to proceed:'));
    console.log(c.dim('  [S] Stash local changes, update, then keep stashed changes for later'));
    console.log(c.dim('  [R] Replace local tracked edits with upstream (git reset --hard)'));
    console.log(c.dim('  [D] Discard this update (keep your current local state)'));

    const answer = (await rl.question('  Selection (S/R/D): ')).trim().toLowerCase();

    if (answer === 'd' || answer === 'discard') {
      console.log(c.yellow('Update cancelled. Your local features/data/history remain unchanged.'));
      return false;
    }

    if (answer === 'r' || answer === 'replace') {
      const reset = Bun.spawnSync(['git', 'reset', '--hard', 'HEAD'], {
        cwd: sourceDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      if (reset.exitCode !== 0) {
        console.log(c.red('âœ— Failed to replace local edits before update:'));
        console.log(c.dim(`  ${(reset.stderr.toString() || reset.stdout.toString()).trim()}`));
        return false;
      }
      console.log(c.green('âœ“ Local tracked edits replaced. Proceeding with update...'));
      return true;
    }

    // Default to stash for any other input including explicit 's'
    const stashMessage = `jarvis-update-${new Date().toISOString()}`;
    const stash = Bun.spawnSync(['git', 'stash', 'push', '-u', '-m', stashMessage], {
      cwd: sourceDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    if (stash.exitCode !== 0) {
      console.log(c.red('âœ— Failed to stash local changes before update:'));
      console.log(c.dim(`  ${(stash.stderr.toString() || stash.stdout.toString()).trim()}`));
      return false;
    }
    console.log(c.green('âœ“ Local changes stashed safely. Proceeding with update...'));
    console.log(c.dim(`  Restore later with: git -C ${sourceDir} stash pop`));
    return true;
  } finally {
    rl.close();
  }
}

async function cmdUpdate(): Promise<void> {
  console.log(c.cyan('Checking for updates...\n'));

  // Get current version
  const currentVersion = getVersion();
  console.log(`  Current version: ${c.bold(currentVersion)}`);

  // Check if daemon is running (restart only after successful update)
  const wasRunning = isLocked();

  // Determine update mode
  const sourceDir = getUpdateSourceDir();
  if (!sourceDir) {
    const latestTag = getLatestGitHubReleaseTag();
    const latestNormalized = latestTag ? latestTag.replace(/^v/i, '') : null;

    console.log('');
    console.log(c.yellow('! This installation is not git-managed from the current environment.'));
    if (isContainerRuntime()) {
      console.log(c.dim('  Detected container runtime. To update safely without touching /data:'));
      console.log(c.dim('  1) docker pull ghcr.io/vierisid/jarvis:latest'));
      console.log(c.dim('  2) recreate the container with the SAME /data volume and env vars'));
      console.log(c.dim('  3) keep using your existing /data mount to preserve features/config/workflows'));
    } else {
      console.log(c.dim('  Re-run the installer or update your ~/.jarvis/daemon checkout, then restart JARVIS.'));
    }

    if (latestNormalized) {
      if (isVersionGreater(latestNormalized, currentVersion)) {
        console.log(c.dim(`  Upstream latest release: v${latestNormalized}`));
      } else {
        console.log(c.dim(`  Installed version appears current relative to release tag v${latestNormalized}.`));
      }
    }
    return;
  }

  // Update via git pull + bun install in resolved source dir
  console.log(c.dim(`  Update source: ${sourceDir}`));

  const canProceed = await handleLocalChangesBeforeUpdate(sourceDir);
  if (!canProceed) {
    return;
  }

  console.log('');
  const gitPull = Bun.spawnSync(['git', 'pull', '--ff-only'], {
    cwd: sourceDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  if (gitPull.exitCode !== 0) {
    console.log(c.red('âœ— Update failed (git pull):'));
    console.log(c.dim(`  ${(gitPull.stderr.toString() || gitPull.stdout.toString()).trim()}`));
    console.log(c.dim('  No user data was modified.'));
    return;
  }

  // Reinstall dependencies
  const bunInstall = Bun.spawnSync(['bun', 'install'], {
    cwd: sourceDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  if (bunInstall.exitCode !== 0) {
    console.log(c.yellow('! Dependencies may need manual refresh: bun install'));
  }

  // Rebuild dashboard assets so updated JS/CSS chunk references stay consistent
  const uiBuild = Bun.spawnSync(['bun', 'run', 'build:ui'], {
    cwd: sourceDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  if (uiBuild.exitCode !== 0) {
    console.log(c.yellow('! UI build failed during update; dashboard may require manual rebuild.'));
    console.log(c.dim('  Run: bun run build:ui'));
  }

  // Get new version
  const newVersion = getVersion();
  if (newVersion === currentVersion) {
    console.log(c.green(`âœ“ Update check complete (no version change: ${currentVersion})`));
  } else {
    console.log(c.green(`âœ“ Updated: ${currentVersion} â†’ ${newVersion}`));
  }

  // Restart daemon if it was running (only after successful update)
  if (wasRunning) {
    console.log(c.dim('\nStopping daemon to apply update...'));
    try {
      process.kill(wasRunning, 'SIGTERM');
      releaseLock();
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch {
      releaseLock();
    }

    console.log(c.dim('\nRestarting daemon...'));
    await cmdStart(['--no-open']);
  }
}

function openDashboard(port: number): void {
  const url = `http://localhost:${port}`;
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      Bun.spawn(['open', url], { stdio: ['ignore', 'ignore', 'ignore'] });
    } else {
      // Check WSL first
      const { readFileSync } = require('node:fs');
      try {
        const version = readFileSync('/proc/version', 'utf-8');
        if (version.toLowerCase().includes('microsoft')) {
          Bun.spawn(['wslview', url], { stdio: ['ignore', 'ignore', 'ignore'] });
          return;
        }
      } catch {}
      // Regular Linux
      Bun.spawn(['xdg-open', url], { stdio: ['ignore', 'ignore', 'ignore'] });
    }
  } catch {
    // Silently fail â€” user can open manually
  }
}

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const args = process.argv.slice(2);
const command = args[0] || 'help';
const commandArgs = args.slice(1);

switch (command) {
  case 'start':
    await cmdStart(commandArgs);
    break;
  case 'stop':
    await cmdStop();
    break;
  case 'restart':
    await cmdRestart(commandArgs);
    break;
  case 'status':
    cmdStatus();
    break;
  case 'logs':
  case 'log':
    cmdLogs(commandArgs);
    break;
  case 'update':
  case 'upgrade':
    await cmdUpdate();
    break;
  case 'onboard':
    await cmdOnboard();
    break;
  case 'doctor':
    await cmdDoctor();
    break;
  case 'version':
  case '-v':
  case '--version':
    console.log(getVersion());
    break;
  case 'help':
  case '-h':
  case '--help':
    printHelp();
    break;
  default:
    console.error(c.red(`Unknown command: ${command}`));
    console.log(c.dim('Run "jarvis help" for usage information.'));
    process.exit(1);
}
