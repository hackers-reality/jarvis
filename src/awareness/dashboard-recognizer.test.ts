import { test, expect, describe } from 'bun:test';
import { DashboardRecognizer } from './dashboard-recognizer.ts';
import { DASHBOARD_DESCRIPTOR } from './dashboard-descriptor-data.ts';

const recognizer = new DashboardRecognizer(DASHBOARD_DESCRIPTOR, 3142);

describe('DashboardRecognizer', () => {
  describe('URL detection', () => {
    test('detects dashboard from localhost:3142 URL', () => {
      const result = recognizer.analyze(
        'Some OCR text',
        'JARVIS Dashboard - Google Chrome',
        'http://localhost:3142/#/goals'
      );
      expect(result.isDashboard).toBe(true);
      expect(result.confidence).toBe('url');
      expect(result.currentPage?.id).toBe('goals');
    });

    test('detects dashboard root as dashboard page', () => {
      const result = recognizer.analyze(
        'Dashboard System Health',
        'JARVIS - Chrome',
        'http://localhost:3142/'
      );
      expect(result.isDashboard).toBe(true);
      expect(result.currentPage?.id).toBe('dashboard');
    });

    test('detects settings sub-route', () => {
      const result = recognizer.analyze(
        'LLM Configuration',
        '',
        'http://localhost:3142/#/settings/llm'
      );
      expect(result.isDashboard).toBe(true);
      expect(result.confidence).toBe('url');
      expect(result.currentPage?.id).toBe('settings');
    });

    test('does not detect non-JARVIS URLs', () => {
      const result = recognizer.analyze(
        'Some page text',
        'Google - Chrome',
        'https://www.google.com'
      );
      expect(result.isDashboard).toBe(false);
      expect(result.confidence).toBe('none');
    });
  });

  describe('window title detection', () => {
    test('detects from JARVIS + localhost in title', () => {
      const result = recognizer.analyze(
        'Dashboard Chat Goals Workflows Agents Tasks Authority Memory',
        'JARVIS Dashboard - localhost:3142 - Chrome',
        null
      );
      expect(result.isDashboard).toBe(true);
      expect(result.confidence).toBe('title');
    });

    test('detects from J.A.R.V.I.S. in title', () => {
      const result = recognizer.analyze(
        'Dashboard Chat Goals Workflows',
        'J.A.R.V.I.S. - localhost:3142 - Firefox',
        null
      );
      expect(result.isDashboard).toBe(true);
      expect(result.confidence).toBe('title');
    });

    test('does not detect JARVIS without dashboard context', () => {
      const result = recognizer.analyze(
        'Some text',
        'JARVIS movie scene - VLC',
        null
      );
      expect(result.isDashboard).toBe(false);
    });
  });

  describe('OCR fallback detection', () => {
    test('detects from J.A.R.V.I.S. branding + sidebar labels', () => {
      const ocrText = `
        J.A.R.V.I.S.
        Dashboard Chat Goals Workflows Agents Tasks Authority Memory
        System online
        Uptime: 3h 42m
      `;
      const result = recognizer.analyze(ocrText, 'Some Browser', null);
      expect(result.isDashboard).toBe(true);
      expect(result.confidence).toBe('ocr');
    });

    test('detects from many sidebar labels alone', () => {
      const ocrText = 'Dashboard Chat Goals Workflows Agents Tasks Authority Memory Pipeline Calendar';
      const result = recognizer.analyze(ocrText, '', null);
      expect(result.isDashboard).toBe(true);
      expect(result.confidence).toBe('ocr');
    });

    test('does not detect from few sidebar labels', () => {
      const ocrText = 'Dashboard Settings';
      const result = recognizer.analyze(ocrText, '', null);
      expect(result.isDashboard).toBe(false);
    });
  });

  describe('page identification from OCR', () => {
    test('identifies Goals page from OCR fingerprints', () => {
      const result = recognizer.analyze(
        'J.A.R.V.I.S. Dashboard Chat Goals Workflows Constellation Timeline Metrics New Goal Explore your objectives',
        'JARVIS - localhost:3142 - Chrome',
        null
      );
      expect(result.isDashboard).toBe(true);
      expect(result.currentPage?.id).toBe('goals');
    });

    test('identifies Awareness page from OCR fingerprints', () => {
      const result = recognizer.analyze(
        'J.A.R.V.I.S. Dashboard Chat Goals Awareness Live Timeline Reports Trends Captures Suggestions Today',
        'JARVIS - localhost:3142 - Chrome',
        null
      );
      expect(result.isDashboard).toBe(true);
      expect(result.currentPage?.id).toBe('awareness');
    });
  });

  describe('panel and element matching', () => {
    test('matches visible panels on Goals page', () => {
      const result = recognizer.analyze(
        'Constellation Timeline Metrics New Goal',
        '',
        'http://localhost:3142/#/goals'
      );
      expect(result.isDashboard).toBe(true);
      expect(result.visiblePanels).toContain('GoalConstellation');
      expect(result.visiblePanels).toContain('GoalTimeline');
      expect(result.visiblePanels).toContain('GoalMetrics');
    });

    test('matches visible elements', () => {
      const result = recognizer.analyze(
        'New Goal Constellation Timeline',
        '',
        'http://localhost:3142/#/goals'
      );
      expect(result.visibleElements).toContain('New Goal');
      expect(result.visibleElements).toContain('Constellation');
    });
  });

  describe('self-suppression integration', () => {
    test('non-dashboard capture returns isDashboard false', () => {
      const result = recognizer.analyze(
        'function main() { console.log("hello") }',
        'main.ts - VS Code',
        null
      );
      expect(result.isDashboard).toBe(false);
      expect(result.currentPage).toBeNull();
      expect(result.visiblePanels).toHaveLength(0);
    });
  });

  describe('descriptor', () => {
    test('returns the full descriptor', () => {
      const desc = recognizer.getDescriptor();
      expect(desc.version).toBe('0.2.0');
      expect(desc.pages.length).toBeGreaterThanOrEqual(14);
    });

    test('all pages have required fields', () => {
      const desc = recognizer.getDescriptor();
      for (const page of desc.pages) {
        expect(page.id).toBeTruthy();
        expect(page.label).toBeTruthy();
        expect(page.path).toBeTruthy();
        expect(page.description).toBeTruthy();
        expect(Array.isArray(page.panels)).toBe(true);
      }
    });
  });
});
