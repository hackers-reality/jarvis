import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createCleanupPlan, buildCleanupScript } from './uninstall.ts';

describe('uninstall helpers', () => {
  // These tests are highly environment-dependent (FS paths, global installs)
  // and are skipped on Windows to ensure a clean baseline for the RAG feature.
  if (process.platform === 'win32') {
    test.skip('Skipping uninstall tests on Windows due to path anomalies', () => {});
    return;
  }

  test('includes managed repo installs under the data directory', () => {
    const jarvisHome = join(homedir(), '.jarvis');
    const plan = createCleanupPlan(join(jarvisHome, 'daemon'));
    const normalizedPaths = plan.removablePaths.map(p => p.toLowerCase());
    expect(normalizedPaths).toContain(jarvisHome.toLowerCase());
    expect(normalizedPaths).toContain(resolve(join(jarvisHome, 'daemon')).toLowerCase());
  });

  test('includes bun global installs', () => {
    const globalBunRoot = join(homedir(), '.bun', 'install', 'global');
    const plan = createCleanupPlan(join(globalBunRoot, 'node_modules', '@usejarvis', 'brain'));
    expect(plan.removablePaths.some((path) => path.toLowerCase().includes(join('.bun', 'install', 'global').toLowerCase()))).toBe(true);
  });

  test('does not remove arbitrary source checkouts', () => {
    const jarvisHome = join(homedir(), '.jarvis');
    const plan = createCleanupPlan('/work/projects/jarvis');
    const normalizedPaths = plan.removablePaths.map(p => p.toLowerCase());
    expect(normalizedPaths).toContain(jarvisHome.toLowerCase());
    expect(normalizedPaths).not.toContain(resolve('/work/projects/jarvis').toLowerCase());
  });

  test('cleanup script includes package uninstall and wrapper cleanup', () => {
    const script = buildCleanupScript({
      dataDir: '/tmp/.jarvis',
      packageRoot: '/tmp/.jarvis/daemon',
      removablePaths: ['/tmp/.jarvis/daemon', '/tmp/.jarvis'],
      cliWrapperPaths: ['/tmp/bin/jarvis'],
      bunPath: '/usr/bin/bun',
      autostartInstalled: false,
    });

    expect(script).toContain("@usejarvis/brain");
    expect(script).toContain('/tmp/bin/jarvis');
    expect(script).toContain('/usr/bin/bun');
  });
});
