/**
 * Dashboard Recognizer — Self-Awareness Module
 *
 * Detects when JARVIS is looking at its own dashboard via screen capture.
 * Uses URL/title matching (primary) with OCR pattern fallback.
 * Identifies the specific page, visible panels, and elements.
 */

import type { DashboardDescriptor, DashboardPage, DashboardDetection } from './types.ts';

// Global OCR patterns that identify the JARVIS dashboard regardless of page
const GLOBAL_FINGERPRINTS = [
  'J.A.R.V.I.S.',
  'JARVIS v0.2',
  'System online',
  'Disconnected',
];

// Sidebar nav labels — if 4+ of these appear in OCR, it's likely the dashboard
const SIDEBAR_LABELS = [
  'Dashboard', 'Chat', 'Goals', 'Workflows', 'Agents',
  'Tasks', 'Authority', 'Memory', 'Pipeline', 'Calendar',
  'Knowledge', 'Command', 'Awareness', 'Settings',
];

const MIN_SIDEBAR_MATCHES = 4;
const MIN_PAGE_FINGERPRINT_MATCHES = 2;

export class DashboardRecognizer {
  private descriptor: DashboardDescriptor;
  private dashboardPort: number;

  constructor(descriptor: DashboardDescriptor, dashboardPort: number = 3142) {
    this.descriptor = descriptor;
    this.dashboardPort = dashboardPort;
  }

  /**
   * Analyze screen context to determine if the JARVIS dashboard is visible.
   */
  analyze(ocrText: string, windowTitle: string, url: string | null): DashboardDetection {
    // 1. URL detection (highest confidence)
    const parsedUrl = url || this.extractUrlFromText(ocrText + ' ' + windowTitle);
    if (parsedUrl && this.isJarvisUrl(parsedUrl)) {
      const page = this.identifyPageFromUrl(parsedUrl) ?? this.identifyPageFromOcr(ocrText);
      return this.buildDetection('url', page, ocrText);
    }

    // 2. Window title detection
    if (this.isJarvisWindowTitle(windowTitle)) {
      const page = this.identifyPageFromOcr(ocrText);
      return this.buildDetection('title', page, ocrText);
    }

    // 3. OCR pattern fallback — check for global JARVIS fingerprints + sidebar labels
    const ocrMatch = this.matchGlobalOcrPatterns(ocrText);
    if (ocrMatch) {
      const page = this.identifyPageFromOcr(ocrText);
      return this.buildDetection('ocr', page, ocrText);
    }

    return {
      isDashboard: false,
      confidence: 'none',
      currentPage: null,
      visiblePanels: [],
      visibleElements: [],
      matchedOcrPatterns: [],
    };
  }

  /**
   * Get the full dashboard descriptor (for API exposure).
   */
  getDescriptor(): DashboardDescriptor {
    return this.descriptor;
  }

  // ── Detection Methods ──

  private isJarvisUrl(url: string): boolean {
    const pattern = new RegExp(`localhost:${this.dashboardPort}|127\\.0\\.0\\.1:${this.dashboardPort}`);
    return pattern.test(url);
  }

  private isJarvisWindowTitle(title: string): boolean {
    if (!title) return false;
    const lower = title.toLowerCase();
    // Match "JARVIS" or "J.A.R.V.I.S." combined with localhost or dashboard context
    const hasJarvis = /jarvis|j\.a\.r\.v\.i\.s/i.test(title);
    const hasDashboardContext = lower.includes('localhost') || lower.includes('dashboard') || lower.includes('3142');
    return hasJarvis && hasDashboardContext;
  }

  private matchGlobalOcrPatterns(ocrText: string): boolean {
    // Check for JARVIS branding
    const hasGlobalFingerprint = GLOBAL_FINGERPRINTS.some(fp =>
      ocrText.includes(fp)
    );

    // Check for sidebar navigation labels
    const sidebarMatches = SIDEBAR_LABELS.filter(label =>
      ocrText.includes(label)
    ).length;

    // Need branding + enough sidebar labels, or many sidebar labels alone
    return (hasGlobalFingerprint && sidebarMatches >= MIN_SIDEBAR_MATCHES) ||
           sidebarMatches >= 7;
  }

  // ── Page Identification ──

  private identifyPageFromUrl(url: string): DashboardPage | null {
    // Parse hash route: http://localhost:3142/#/goals → "goals"
    const hashMatch = url.match(/#\/(\w+)/);
    if (!hashMatch) {
      // No hash = dashboard home
      return this.descriptor.pages.find(p => p.id === 'dashboard') ?? null;
    }

    const routeId = hashMatch[1];
    // Handle settings sub-routes: #/settings/llm → settings
    const baseRoute = routeId === 'settings' ? 'settings' : routeId;
    return this.descriptor.pages.find(p => p.id === baseRoute) ?? null;
  }

  private identifyPageFromOcr(ocrText: string): DashboardPage | null {
    let bestPage: DashboardPage | null = null;
    let bestScore = 0;

    for (const page of this.descriptor.pages) {
      if (!page.ocrFingerprints) continue;

      let score = 0;
      for (const fp of page.ocrFingerprints) {
        if (ocrText.includes(fp)) {
          score++;
        }
      }

      // Normalize by fingerprint count to avoid bias toward pages with more fingerprints
      const normalizedScore = page.ocrFingerprints.length > 0
        ? score / page.ocrFingerprints.length
        : 0;

      if (score >= MIN_PAGE_FINGERPRINT_MATCHES && normalizedScore > bestScore) {
        bestScore = normalizedScore;
        bestPage = page;
      }
    }

    return bestPage;
  }

  private extractUrlFromText(text: string): string | null {
    const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s]*/);
    return match ? match[0] : null;
  }

  // ── Detection Building ──

  private buildDetection(
    confidence: 'url' | 'title' | 'ocr',
    page: DashboardPage | null,
    ocrText: string
  ): DashboardDetection {
    const visiblePanels: string[] = [];
    const visibleElements: string[] = [];
    const matchedPatterns: string[] = [];

    // Track which global patterns matched
    for (const fp of GLOBAL_FINGERPRINTS) {
      if (ocrText.includes(fp)) matchedPatterns.push(fp);
    }

    // Match visible panels and elements from OCR text
    if (page) {
      for (const fp of (page.ocrFingerprints ?? [])) {
        if (ocrText.includes(fp)) matchedPatterns.push(fp);
      }

      for (const panel of page.panels) {
        if (ocrText.includes(panel.label)) {
          visiblePanels.push(panel.id);
          for (const el of panel.elements) {
            if (ocrText.includes(el.label)) {
              visibleElements.push(el.label);
            }
          }
        }
      }
    }

    return {
      isDashboard: true,
      confidence,
      currentPage: page,
      visiblePanels,
      visibleElements,
      matchedOcrPatterns: matchedPatterns,
    };
  }
}
