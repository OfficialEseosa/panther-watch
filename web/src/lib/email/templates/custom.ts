import { cleanSubject, htmlToText } from "../escape";
import { renderLayout, textFooter, type RenderedEmail } from "./layout";

const CSS = `.content { padding: 38px 36px 12px; }

.eyebrow { margin: 0 0 10px; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #0039a6; }
.h1 { margin: 0 0 22px; font-size: 24px; line-height: 1.3; font-weight: 800; letter-spacing: -0.01em; color: #15223b; }

.message-body { font-size: 16px; line-height: 1.7; font-weight: 500; color: #33425e; }
.message-body a { color: #0039a6; font-weight: 700; }

.signature {
    margin-top: 30px;
    padding-top: 22px;
    border-top: 1px solid #e6ebf3;
    font-size: 15px;
    font-weight: 500;
    color: #3a4a66;
}
.signature strong { color: #15223b; font-weight: 700; }

@media only screen and (max-width: 620px) {
    .container { width: 100% !important; border-radius: 0 !important; }
    .content { padding: 28px 22px 8px !important; }
    .header { padding: 26px 22px 22px !important; }
    .footer { padding: 24px 22px 28px !important; }
}`;

const DEFAULT_PREHEADER = "A message from the PantherWatch team.";
const FOOTER_REASON = "You're receiving this because you have a PantherWatch account.";

export interface CustomTemplateInput {
  appUrl: string;
  /** Plain text. Sent as the Subject header and escaped wherever it appears in the HTML. */
  subject: string;
  /**
   * Raw HTML written by an admin. Inserted unescaped on purpose: admins compose the body
   * with links and formatting. Never pass user-controlled content here.
   */
  htmlBody: string;
  /** Plain text inbox preview; escaped. */
  previewText?: string | null;
}

export function renderCustomEmail({ appUrl, subject, htmlBody, previewText }: CustomTemplateInput): RenderedEmail {
  const cleanedSubject = cleanSubject(subject);
  const content = `                            <p class="eyebrow">From the team</p>
                            <h1 class="h1">A quick note for you</h1>

                            <div class="message-body">
                                ${htmlBody}
                            </div>

                            <div class="signature">
                                The <strong>PantherWatch</strong> team
                            </div>`;

  const text = `A quick note for you

${htmlToText(htmlBody)}

The PantherWatch team

${textFooter(appUrl, FOOTER_REASON)}
`;

  return {
    subject: cleanedSubject,
    html: renderLayout({
      appUrl,
      title: cleanedSubject || "A message from PantherWatch",
      preheader: previewText?.trim() || DEFAULT_PREHEADER,
      css: CSS,
      content,
      footerReason: FOOTER_REASON,
    }),
    text,
  };
}
