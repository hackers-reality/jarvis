import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { compareVersions, getUpdateStatus } from './update-manager.ts';
import { initDatabase, closeDb } from '../vault/schema.ts';
import { deleteSetting, setSetting } from '../vault/settings.ts';

describe('update-manager', () => {
  beforeEach(() => {
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDb();
  });

  test('compareVersions handles segment length differences', () => {
    expect(compareVersions('1.2.0', '1.2')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBe(1);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
  });

  test('compareVersions handles prereleases', () => {
    expect(compareVersions('1.2.0', '1.2.0-beta.1')).toBe(1);
    expect(compareVersions('1.2.0-beta.2', '1.2.0-beta.1')).toBe(1);
    expect(compareVersions('1.2.0-alpha', '1.2.0-beta')).toBe(-1);
  });

  test('getUpdateStatus hides popup when latest version was dismissed', async () => {
    setSetting('jarvis.update.latest_version', '0.9.9');
    setSetting('jarvis.update.latest_name', 'v0.9.9');
    setSetting('jarvis.update.latest_url', 'https://github.com/vierisid/jarvis/releases/tag/v0.9.9');
    setSetting('jarvis.update.latest_published_at', '2026-03-31T00:00:00Z');
    setSetting('jarvis.update.last_checked_at', String(Date.now()));
    setSetting('jarvis.update.dismissed_version', '0.9.9');
    setSetting('jarvis.update.status', 'idle');

    const status = await getUpdateStatus(false);

    expect(status.latest_version).toBe('0.9.9');
    expect(status.has_update).toBe(true);
    expect(status.popup_visible).toBe(false);
  });

  test('getUpdateStatus exposes cached release when refresh is not required', async () => {
    setSetting('jarvis.update.latest_version', '0.9.9');
    setSetting('jarvis.update.latest_name', 'Jarvis v0.9.9');
    setSetting('jarvis.update.latest_url', 'https://github.com/vierisid/jarvis/releases/tag/v0.9.9');
    setSetting('jarvis.update.latest_published_at', '2026-03-31T00:00:00Z');
    setSetting('jarvis.update.last_checked_at', String(Date.now()));
    deleteSetting('jarvis.update.dismissed_version');

    const status = await getUpdateStatus(false);

    expect(status.latest_name).toBe('Jarvis v0.9.9');
    expect(status.latest_url).toContain('v0.9.9');
    expect(status.popup_visible).toBe(true);
  });
});
