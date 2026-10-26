import { escapeHtml } from "../escape";
import { renderLayout, textFooter, type RenderedEmail } from "./layout";
import { greetingName } from "@/lib/format";
import {
  WELCOME_FEATURES,
  WELCOME_INTRO,
  WELCOME_PREHEADER,
  WELCOME_SIGNATURE,
  WELCOME_SIGNOFF,
  WELCOME_SUBJECT,
} from "./welcomeCopy";

export { WELCOME_SUBJECT };

const CSS = `.content { padding: 38px 36px 8px; }

.eyebrow { margin: 0 0 10px; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #0039a6; }
.h1 { margin: 0 0 18px; font-size: 26px; line-height: 1.25; font-weight: 800; letter-spacing: -0.01em; color: #15223b; }
.p { margin: 0 0 10px; font-size: 16px; line-height: 1.7; font-weight: 500; color: #3a4a66; }

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

.btn-wrap { padding: 26px 0 8px; text-align: center; }
.signoff { margin: 26px 0 8px; font-size: 15px; line-height: 1.6; font-weight: 500; color: #3a4a66; }
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

const FOOTER_REASON = "You're receiving this because you created a PantherWatch account.";

export interface WelcomeTemplateInput {
  appUrl: string;
  name: string | null | undefined;
}

export function renderWelcomeEmail({ appUrl, name }: WelcomeTemplateInput): RenderedEmail {
  const who = greetingName(name);
  const rows = WELCOME_FEATURES.map(
    (f, i) => `                                <tr class="step-row">
                                    <td class="step-n"><span class="step-badge">${i + 1}</span></td>
                                    <td class="step-t"><strong>${escapeHtml(f.lead)}</strong>${escapeHtml(f.rest)}</td>
                                </tr>`,
  ).join("\n");
  const content = `                            <p class="eyebrow">Welcome aboard</p>
                            <h1 class="h1">You're in, ${escapeHtml(who)}.</h1>
                            <p class="p">${escapeHtml(WELCOME_INTRO)}</p>

                            <table role="presentation" class="steps" cellpadding="0" cellspacing="0" border="0">
${rows}
                            </table>

                            <div class="btn-wrap">
                                <a href="${escapeHtml(appUrl)}" class="btn">Open PantherWatch</a>
                            </div>

                            <p class="signoff">${escapeHtml(WELCOME_SIGNOFF)}<br>${escapeHtml(WELCOME_SIGNATURE)}</p>`;

  const text = `You're in, ${who}.

${WELCOME_INTRO}

${WELCOME_FEATURES.map((f, i) => `${i + 1}. ${f.lead}${f.rest}`).join("\n")}

Open PantherWatch: ${appUrl}

${WELCOME_SIGNOFF}
${WELCOME_SIGNATURE}

${textFooter(appUrl, FOOTER_REASON)}
`;

  return {
    subject: WELCOME_SUBJECT,
    html: renderLayout({
      appUrl,
      title: "Welcome to PantherWatch",
      preheader: WELCOME_PREHEADER,
      css: CSS,
      content,
      footerReason: FOOTER_REASON,
    }),
    text,
  };
}
