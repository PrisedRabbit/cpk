/**
 * Agentic PM — Unified Design System
 *
 * Dual-mode (dark: "Kinetic Ledger" / light: "Clinical Architect").
 * Extracted from the Stitch design deliverables.
 *
 * Usage: import into tailwind.config.ts or use as CSS custom properties.
 *
 * Design rules:
 *   1. NO-LINE RULE: No 1px solid borders for structure. Use tonal surface shifts.
 *   2. TONAL DEPTH: Depth via surface stacking, not drop shadows.
 *   3. SACRED COLORS: Status/priority colors are fixed across both themes.
 *   4. COMPACT DENSITY: Cards max 70px. body-sm (12px) is the workhorse.
 *   5. MONOSPACE FOR DATA: Task IDs, timestamps, verify commands — always mono.
 *   6. SYSTEM FONTS DEFAULT: Load Google Fonts only if available, fall back to system.
 */

// ============================================================
// FONT STACKS — system first, Google Fonts if loaded
// ============================================================

export const fontFamily = {
  sans: [
    "Inter",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
  mono: [
    "Fira Code",
    "SF Mono",
    "Cascadia Code",
    "JetBrains Mono",
    "Menlo",
    "Consolas",
    "monospace",
  ],
} as const;

// ============================================================
// TYPOGRAPHY SCALE
// ============================================================

export const typography = {
  "display-sm": { size: "2.25rem", weight: 700, tracking: "-0.02em" },
  "headline-sm": { size: "1.5rem", weight: 700, tracking: "-0.01em" },
  "title-sm": { size: "1.0rem", weight: 600, tracking: "-0.01em" },
  "body-md": { size: "0.875rem", weight: 400, tracking: "normal" },
  "body-sm": { size: "0.75rem", weight: 400, tracking: "normal" },
  "label-md": { size: "0.75rem", weight: 500, tracking: "0.02em" },
  "label-sm": { size: "0.6875rem", weight: 600, tracking: "0.05em" },
} as const;

// ============================================================
// SPACING — 4px base
// ============================================================

export const spacing = {
  "0.5": "0.125rem", // 2px
  "1": "0.25rem", // 4px
  "1.5": "0.375rem", // 6px
  "2": "0.5rem", // 8px
  "2.5": "0.625rem", // 10px
  "3": "0.75rem", // 12px
  "3.5": "0.875rem", // 14px
  "4": "1rem", // 16px
  "5": "1.25rem", // 20px
  "6": "1.5rem", // 24px
  "8": "2rem", // 32px
  "10": "2.5rem", // 40px
  "12": "3rem", // 48px
} as const;

// ============================================================
// BORDER RADIUS — engineered precision, not organic
// ============================================================

export const borderRadius = {
  DEFAULT: "0.125rem", // 2px — default "stamp" feel
  sm: "0.125rem", // 2px
  md: "0.25rem", // 4px
  lg: "0.5rem", // 8px — max for cards
  full: "0.75rem", // 12px — status pills only
} as const;

// ============================================================
// DARK THEME — "The Kinetic Ledger"
// Obsidian-based. UI "glows from within."
// ============================================================

export const darkColors = {
  // Surfaces (layered depth, darkest = furthest away)
  surface: "#10141a",
  "surface-dim": "#10141a",
  "surface-bright": "#353940",
  "surface-container-lowest": "#0a0e14",
  "surface-container-low": "#181c22",
  "surface-container": "#1c2026",
  "surface-container-high": "#262a31",
  "surface-container-highest": "#31353c",
  "surface-variant": "#31353c",
  "surface-tint": "#a2c9ff",
  background: "#10141a",

  // Text
  "on-surface": "#dfe2eb",
  "on-surface-variant": "#c0c7d4",
  "on-background": "#dfe2eb",

  // Primary (blue accent)
  primary: "#a2c9ff",
  "primary-container": "#58a6ff",
  "primary-dim": "#58a6ff",
  "primary-fixed": "#d3e4ff",
  "primary-fixed-dim": "#a2c9ff",
  "on-primary": "#00315c",
  "on-primary-container": "#003a6b",
  "on-primary-fixed": "#001c38",

  // Secondary (neutral cool)
  secondary: "#c1c7d0",
  "secondary-container": "#41474f",
  "on-secondary": "#2b3138",
  "on-secondary-container": "#b0b5be",

  // Tertiary (purple)
  tertiary: "#d5bbff",
  "tertiary-container": "#b88eff",
  "on-tertiary": "#41008b",
  "on-tertiary-container": "#4c069d",

  // Error
  error: "#ffb4ab",
  "error-container": "#93000a",
  "on-error": "#690005",
  "on-error-container": "#ffdad6",

  // Outlines
  outline: "#8b919d",
  "outline-variant": "#414752",

  // Inverse
  "inverse-surface": "#dfe2eb",
  "inverse-on-surface": "#2d3137",
  "inverse-primary": "#0060aa",
} as const;

// ============================================================
// LIGHT THEME — "The Clinical Architect"
// Paper & Ink philosophy. Tonal isometry.
// ============================================================

export const lightColors = {
  // Surfaces (layered depth, lightest = closest)
  surface: "#f8f9fb",
  "surface-dim": "#cfdce3",
  "surface-bright": "#f8f9fb",
  "surface-container-lowest": "#ffffff",
  "surface-container-low": "#f0f4f7",
  "surface-container": "#e8eff3",
  "surface-container-high": "#e1e9ee",
  "surface-container-highest": "#d9e4ea",
  "surface-variant": "#d9e4ea",
  "surface-tint": "#005bc0",
  background: "#f8f9fb",

  // Text
  "on-surface": "#2a3439",
  "on-surface-variant": "#57606a",
  "on-background": "#2a3439",

  // Primary (blue accent — deeper in light mode)
  primary: "#005bc0",
  "primary-container": "#d8e2ff",
  "primary-dim": "#004fa9",
  "primary-fixed": "#d8e2ff",
  "primary-fixed-dim": "#a2c9ff",
  "on-primary": "#f7f7ff",
  "on-primary-container": "#004fa8",
  "on-primary-fixed": "#003d85",

  // Secondary
  secondary: "#57606a",
  "secondary-container": "#dae3ef",
  "secondary-dim": "#4b545e",
  "on-secondary": "#f6f9ff",
  "on-secondary-container": "#4a535c",

  // Tertiary (purple)
  tertiary: "#723ece",
  "tertiary-container": "#a06fff",
  "tertiary-dim": "#652fc1",
  "on-tertiary": "#fef7ff",
  "on-tertiary-container": "#06001a",

  // Error
  error: "#9f403d",
  "error-container": "#fe8983",
  "on-error": "#fff7f6",
  "on-error-container": "#752121",

  // Outlines
  outline: "#717c82",
  "outline-variant": "#a9b4b9",

  // Inverse
  "inverse-surface": "#0b0f10",
  "inverse-on-surface": "#9a9d9f",
  "inverse-primary": "#4a8eff",
} as const;

// ============================================================
// SACRED STATUS COLORS — fixed across both themes
// These never change based on theme. They are semantic.
// ============================================================

export const statusColors = {
  dark: {
    open: "#58a6ff",
    "in-progress": "#d29922",
    review: "#a371f7",
    blocked: "#f85149",
    done: "#3fb950",
    backlog: "#484f58",
  },
  light: {
    open: "#0969da",
    "in-progress": "#9a6700",
    review: "#8250df",
    blocked: "#cf222e",
    done: "#1a7f37",
    backlog: "#57606a",
  },
} as const;

// ============================================================
// PRIORITY COLORS
// ============================================================

export const priorityColors = {
  dark: {
    P0: "#f85149", // red — critical
    P1: "#d29922", // amber — high
    P2: "#8b949e", // gray — standard
  },
  light: {
    P0: "#cf222e",
    P1: "#9a6700",
    P2: "#57606a",
  },
} as const;

// ============================================================
// AGENT STATUS COLORS
// ============================================================

export const agentStatusColors = {
  dark: {
    working: "#3fb950",
    idle: "#8b949e",
    offline: "#f85149",
  },
  light: {
    working: "#1a7f37",
    idle: "#57606a",
    offline: "#cf222e",
  },
} as const;

// ============================================================
// COMPONENT SPECS
// ============================================================

export const componentSpecs = {
  card: {
    height: "70px",
    padding: "0.625rem", // spacing-2.5
    borderRadius: "0.125rem", // sm
    leftBorderWidth: "2px",
  },
  sidebar: {
    width: "288px", // w-72
    iconBarWidth: "64px", // w-16
  },
  topBar: {
    height: "48px", // h-12
  },
  detailPanel: {
    width: "45%",
    minWidth: "400px",
    maxWidth: "600px",
  },
  modal: {
    maxWidth: "600px",
    backdropBlur: "12px",
    backdropOpacity: 0.8,
  },
  column: {
    minWidth: "280px",
    gap: "1.5rem", // spacing-6
  },
} as const;

// ============================================================
// CSS CUSTOM PROPERTIES GENERATOR
// Generates --apm-* variables for both themes
// ============================================================

export function generateCSSVariables(theme: "dark" | "light"): string {
  const colors = theme === "dark" ? darkColors : lightColors;
  const status = statusColors[theme];
  const priority = priorityColors[theme];
  const agent = agentStatusColors[theme];

  const lines: string[] = [];

  // Surface colors
  for (const [key, value] of Object.entries(colors)) {
    lines.push(`  --apm-${key}: ${value};`);
  }

  // Status colors
  for (const [key, value] of Object.entries(status)) {
    lines.push(`  --apm-status-${key}: ${value};`);
  }

  // Priority colors
  for (const [key, value] of Object.entries(priority)) {
    lines.push(`  --apm-priority-${key.toLowerCase()}: ${value};`);
  }

  // Agent status colors
  for (const [key, value] of Object.entries(agent)) {
    lines.push(`  --apm-agent-${key}: ${value};`);
  }

  return lines.join("\n");
}
