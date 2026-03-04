/* styles/theme.css
   SkipLogic Hybrid Theme v1
   - Light for marketing/auth
   - Dark for app
*/

:root {
  --font-sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Apple Color Emoji",
    "Segoe UI Emoji";

  /* Brand */
  --brand-ink: #0b1220;       /* yard slate */
  --brand-mint: #37f59b;      /* hi-vis mint */
  --brand-sky: #3ab5ff;       /* signal blue */
  --brand-amber: #ffb24a;     /* warning accent */

  /* Radii (slightly squarer than trendy SaaS) */
  --r-sm: 10px;
  --r-md: 14px;
  --r-lg: 18px;

  /* Shadows (subtle, not “glow”) */
  --shadow-1: 0 10px 30px rgba(11, 18, 32, 0.12);
  --shadow-2: 0 18px 60px rgba(11, 18, 32, 0.18);

  /* Light surface */
  --l-bg: #f6f8fc;
  --l-surface: #ffffff;
  --l-ink: #0b1220;
  --l-muted: rgba(11, 18, 32, 0.68);
  --l-border: rgba(11, 18, 32, 0.12);

  /* Dark surface */
  --d-bg: #070b14;
  --d-surface: #0c1222;
  --d-panel: #101a2e;
  --d-ink: #eaf0ff;
  --d-muted: rgba(234, 240, 255, 0.72);
  --d-border: rgba(255, 255, 255, 0.12);

  /* Focus */
  --focus: 0 0 0 4px rgba(58, 181, 255, 0.18);
}

html, body {
  padding: 0;
  margin: 0;
  font-family: var(--font-sans);
}

/* Utilities */
.sl-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid rgba(11, 18, 32, 0.12);
  background: rgba(255, 255, 255, 0.65);
  color: rgba(11, 18, 32, 0.82);
}

.sl-chipDot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--brand-mint);
  box-shadow: 0 0 0 4px rgba(55, 245, 155, 0.16);
}

.sl-btn {
  border: 0;
  cursor: pointer;
  border-radius: var(--r-md);
  padding: 12px 14px;
  font-weight: 750;
  letter-spacing: -0.01em;
}

.sl-btnPrimary {
  color: #071013;
  background: linear-gradient(135deg, var(--brand-mint), rgba(58, 181, 255, 0.9));
}

.sl-btnPrimary:hover { filter: brightness(1.02); }
.sl-btnPrimary:disabled { opacity: 0.55; cursor: not-allowed; }

.sl-input {
  width: 100%;
  border-radius: var(--r-md);
  padding: 12px 12px;
  font-size: 14px;
  outline: none;
  border: 1px solid var(--l-border);
  background: rgba(255, 255, 255, 0.9);
  color: var(--l-ink);
}

.sl-input:focus {
  border-color: rgba(58, 181, 255, 0.55);
  box-shadow: var(--focus);
}

.sl-link {
  color: rgba(11, 18, 32, 0.92);
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Dark mode variants (for /app) */
.sl-dark .sl-input {
  border: 1px solid var(--d-border);
  background: rgba(255, 255, 255, 0.06);
  color: var(--d-ink);
}

.sl-dark .sl-input::placeholder { color: rgba(234, 240, 255, 0.55); }
.sl-dark .sl-link { color: rgba(234, 240, 255, 0.9); }
