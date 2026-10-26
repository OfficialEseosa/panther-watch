import { escapeHtml } from "../escape";
import { renderLayout, textFooter, type RenderedEmail } from "./layout";
import { greetingName } from "@/lib/format";

const CSS = `.content { padding: 40px 36px 12px; }

.eyebrow { margin: 0 0 10px; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #0039a6; }
.h1 { margin: 0 0 20px; font-size: 25px; line-height: 1.28; font-weight: 800; letter-spacing: -0.01em; color: #15223b; }
.p { margin: 0 0 20px; font-size: 16px; line-height: 1.7; font-weight: 500; color: #3a4a66; }

.support {
    background-color: #eaf0fb;
    border-left: 4px solid #0039a6;
    border-radius: 0 8px 8px 0;
    padding: 16px 20px;
    margin: 28px 0 6px;
    font-size: 15px;
    line-height: 1.6;
    font-weight: 500;
    color: #3a4a66;
}
.support strong { color: #15223b; font-weight: 700; }

@media only screen and (max-width: 620px) {
    .container { width: 100% !important; border-radius: 0 !important; }
    .content { padding: 30px 22px 8px !important; }
    .header { padding: 26px 22px 22px !important; }
    .footer { padding: 24px 22px 28px !important; }
    .h1 { font-size: 22px !important; }
}`;

export const GOODBYE_SUBJECT = "We're sorry to see you go";
const PREHEADER = "Your account and tracked classes have been removed. You're always welcome back.";
const FOOTER_REASON = "This is a one-time confirmation of your account deletion.";

export interface GoodbyeTemplateInput {
  appUrl: string;
  name: string | null | undefined;
}

export function renderGoodbyeEmail({ appUrl, name }: GoodbyeTemplateInput): RenderedEmail {
  const who = greetingName(name);
  const content = `                            <p class="eyebrow">Account closed</p>
                            <h1 class="h1">Sorry to see you go, ${escapeHtml(who)}.</h1>
                            <p class="p">
                                Your PantherWatch account and every class you were tracking have been
                                permanently removed from our system. Nothing is left on our end.
                            </p>
                            <p class="p">
                                If you ever need to chase down a seat again, you're always welcome back.
                                Just sign in and pick up where you left off.
                            </p>

                            <div class="support">
                                Changed your mind or have feedback? Just <strong>reply to this email</strong>
                                and a real person will read it.
                            </div>`;

  const text = `Sorry to see you go, ${who}.

Your PantherWatch account and every class you were tracking have been permanently removed from our system. Nothing is left on our end.

If you ever need to chase down a seat again, you're always welcome back. Just sign in and pick up where you left off.

Changed your mind or have feedback? Just reply to this email and a real person will read it.

${textFooter(appUrl, FOOTER_REASON)}
`;

  return {
    subject: GOODBYE_SUBJECT,
    html: renderLayout({
      appUrl,
      title: "Your PantherWatch account was deleted",
      preheader: PREHEADER,
      css: CSS,
      content,
      footerReason: FOOTER_REASON,
    }),
    text,
  };
}
