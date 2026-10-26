import { escapeHtml } from "../escape";

/** What every template renders to. `text` is the plain-text alternative part. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Styles shared by all four templates (identical in each of the Java .css files): page,
 * card container, logo header with the GSU-blue rule, and footer. Inter, exact GSU Blue
 * (#0039A6), no gradients, table layout.
 */
const BASE_CSS = `body {
    margin: 0;
    padding: 0;
    background-color: #f0f3f9;
    color: #1b2a47;
    font-weight: 500;
    -webkit-font-smoothing: antialiased;
    font-family: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
}

.preheader {
    display: none !important;
    visibility: hidden;
    opacity: 0;
    color: transparent;
    height: 0;
    width: 0;
    overflow: hidden;
}

.wrap { width: 100%; background-color: #f0f3f9; }

.container {
    width: 600px;
    max-width: 600px;
    background-color: #ffffff;
    border: 1px solid #dfe5ef;
    border-radius: 12px;
    overflow: hidden;
}

.gutter { height: 32px; line-height: 32px; font-size: 0; }

.header {
    background-color: #ffffff;
    padding: 30px 36px 26px;
    text-align: center;
    border-bottom: 3px solid #0039a6;
}
.logo { width: 48px; height: 48px; display: inline-block; }
.brand { margin: 12px 0 0; font-size: 22px; font-weight: 800; letter-spacing: -0.01em; color: #0039a6; }

.footer {
    padding: 28px 36px 34px;
    text-align: center;
    background-color: #f5f7fb;
    border-top: 1px solid #e6ebf3;
}
.f-brand { margin: 0 0 4px; font-size: 15px; font-weight: 800; color: #15223b; }
.f-tag { margin: 0 0 14px; font-size: 13px; font-weight: 500; color: #6b7796; }
.f-links { margin: 0 0 14px; font-size: 13px; }
.f-links a { color: #0039a6; text-decoration: none; font-weight: 700; }
.f-fine { margin: 0; font-size: 12px; line-height: 1.6; font-weight: 500; color: #93a0bd; }`;

export const GOSOLAR_REGISTRATION_URL =
  "https://registration.gosolar.gsu.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=registration";

export const FOOTER_TAGLINE = "Real-time seat tracking for Georgia State students.";
export const NOT_AFFILIATED = "Not affiliated with Georgia State University.";

/** "https://www.pantherwatch.app" -> "pantherwatch.app"; the footer link text. */
export function siteLabel(appUrl: string): string {
  try {
    return new URL(appUrl).host.replace(/^www\./, "");
  } catch {
    return appUrl;
  }
}

export interface LayoutParts {
  appUrl: string;
  /** Plain text; escaped here. */
  title: string;
  /** Plain text; escaped here. Shown by inbox list views next to the subject. */
  preheader: string;
  /** Template-specific CSS appended after BASE_CSS. */
  css: string;
  /** Already-escaped HTML for the content cell. */
  content: string;
  /** Plain text; escaped here. First sentence of the footer fine print. */
  footerReason: string;
}

/**
 * The page shell every template shares. The CSS is inlined in a <style> block in place of
 * the Java templates' <link rel="stylesheet">, exactly as EmailService did. The logo is
 * email-logo.png (opaque white chip baked in) so it stays visible in dark-mode clients.
 */
export function renderLayout(parts: LayoutParts): string {
  const appUrl = escapeHtml(parts.appUrl);
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(parts.title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
${BASE_CSS}

${parts.css}
    </style>
</head>
<body>
    <span class="preheader">${escapeHtml(parts.preheader)}</span>
    <table role="presentation" class="wrap" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td align="center">
                <div class="gutter">&nbsp;</div>
                <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td class="header">
                            <img src="${appUrl}/email-logo.png" width="48" height="48" alt="PantherWatch" class="logo">
                            <p class="brand">PantherWatch</p>
                        </td>
                    </tr>
                    <tr>
                        <td class="content">
${parts.content}
                        </td>
                    </tr>
                    <tr>
                        <td class="footer">
                            <p class="f-brand">PantherWatch</p>
                            <p class="f-tag">${FOOTER_TAGLINE}</p>
                            <p class="f-links"><a href="${appUrl}">${escapeHtml(siteLabel(parts.appUrl))}</a></p>
                            <p class="f-fine">
                                ${escapeHtml(parts.footerReason)}
                                ${NOT_AFFILIATED}
                            </p>
                        </td>
                    </tr>
                </table>
                <div class="gutter">&nbsp;</div>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

/** Plain-text footer matching the HTML one. */
export function textFooter(appUrl: string, footerReason: string): string {
  return `--
PantherWatch
${FOOTER_TAGLINE}
${appUrl}

${footerReason} ${NOT_AFFILIATED}`;
}
