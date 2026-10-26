import { escapeHtml } from "../escape";
import { renderLayout, textFooter, type RenderedEmail } from "./layout";
import { greetingName } from "@/lib/format";

const CSS = `.content { padding: 38px 36px 8px; }

.eyebrow { margin: 0 0 10px; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #0039a6; }
.h1 { margin: 0 0 18px; font-size: 26px; line-height: 1.25; font-weight: 800; letter-spacing: -0.01em; color: #15223b; }
.p { margin: 0 0 22px; font-size: 16px; line-height: 1.7; font-weight: 500; color: #3a4a66; }

.steps { width: 100%; margin: 8px 0 4px; }
.step-row td { padding: 9px 0; vertical-align: top; }
.step-n { width: 32px; }
.step-badge {
    display: inline-block;
    width: 28px;
    height: 28px;
    line-height: 28px;
    text-align: center;
    border-radius: 50%;
    background-color: #eaf0fb;
    color: #0039a6;
    font-size: 14px;
    font-weight: 800;
}
.step-t { padding-left: 14px; font-size: 15px; line-height: 1.6; font-weight: 500; color: #3a4a66; }
.step-t strong { color: #15223b; font-weight: 700; }

.callout {
    background-color: #eaf0fb;
    border-left: 4px solid #0039a6;
    border-radius: 0 8px 8px 0;
    padding: 16px 20px;
    margin: 26px 0 8px;
    font-size: 15px;
    line-height: 1.6;
    font-weight: 500;
    color: #3a4a66;
}
.callout strong { color: #15223b; font-weight: 700; }

.btn-wrap { padding: 30px 0 8px; text-align: center; }
.btn {
    display: inline-block;
    background-color: #0039a6;
    color: #ffffff;
    text-decoration: none;
    padding: 15px 36px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 16px;
}

@media only screen and (max-width: 620px) {
    .container { width: 100% !important; border-radius: 0 !important; }
    .content { padding: 30px 22px 4px !important; }
    .header { padding: 26px 22px 22px !important; }
    .footer { padding: 24px 22px 28px !important; }
    .h1 { font-size: 23px !important; }
}`;

export const WELCOME_SUBJECT = "🎉 Welcome to PantherWatch!";
const PREHEADER = "You're all set. Here's how to grab the classes you actually need.";
const FOOTER_REASON = "You're receiving this because you created a PantherWatch account.";

export interface WelcomeTemplateInput {
  appUrl: string;
  name: string | null | undefined;
}

export function renderWelcomeEmail({ appUrl, name }: WelcomeTemplateInput): RenderedEmail {
  const who = greetingName(name);
  const content = `                            <p class="eyebrow">Welcome aboard</p>
                            <h1 class="h1">You're in, ${escapeHtml(who)}.</h1>
                            <p class="p">
                                PantherWatch watches Georgia State's course catalog and emails you the
                                moment a seat opens in a class you're tracking. No more refreshing GoSolar.
                            </p>

                            <table role="presentation" class="steps" cellpadding="0" cellspacing="0" border="0">
                                <tr class="step-row">
                                    <td class="step-n"><span class="step-badge">1</span></td>
                                    <td class="step-t"><strong>Search any course</strong> by subject, course number, or CRN.</td>
                                </tr>
                                <tr class="step-row">
                                    <td class="step-n"><span class="step-badge">2</span></td>
                                    <td class="step-t"><strong>Tap Watch</strong> on the exact sections you want to track.</td>
                                </tr>
                                <tr class="step-row">
                                    <td class="step-n"><span class="step-badge">3</span></td>
                                    <td class="step-t"><strong>Get the alert</strong> the instant a seat or waitlist spot opens.</td>
                                </tr>
                            </table>

                            <div class="callout">
                                <strong>Tip:</strong> Watch full classes too. Students drop during the first
                                week, and you'll be first in line when they do.
                            </div>

                            <div class="btn-wrap">
                                <a href="${escapeHtml(appUrl)}" class="btn">Open PantherWatch</a>
                            </div>`;

  const text = `You're in, ${who}.

PantherWatch watches Georgia State's course catalog and emails you the moment a seat opens in a class you're tracking. No more refreshing GoSolar.

1. Search any course by subject, course number, or CRN.
2. Tap Watch on the exact sections you want to track.
3. Get the alert the instant a seat or waitlist spot opens.

Tip: Watch full classes too. Students drop during the first week, and you'll be first in line when they do.

Open PantherWatch: ${appUrl}

${textFooter(appUrl, FOOTER_REASON)}
`;

  return {
    subject: WELCOME_SUBJECT,
    html: renderLayout({
      appUrl,
      title: "Welcome to PantherWatch",
      preheader: PREHEADER,
      css: CSS,
      content,
      footerReason: FOOTER_REASON,
    }),
    text,
  };
}
