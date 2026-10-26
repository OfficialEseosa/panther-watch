/**
 * The welcome message's words, shared by the automatic welcome email (welcome.ts) and the
 * admin composer's "Welcome message" preset (components/admin/emailForm.ts) so the two can't
 * drift. Plain text, no imports: the admin preset ships in the client bundle.
 */

export const WELCOME_SUBJECT = "🎉 Welcome to PantherWatch!";
export const WELCOME_PREHEADER = "Seat alerts, grade history and a schedule builder for your GSU classes.";
export const WELCOME_INTRO = "Here's what PantherWatch does for you:";

export interface WelcomeFeature {
  /** Bold lead-in. */
  lead: string;
  /** The rest of the sentence, starting with a space or punctuation. */
  rest: string;
}

export const WELCOME_FEATURES: readonly WelcomeFeature[] = [
  {
    lead: "Seat alerts.",
    rest: " We check every few minutes and email you the moment a seat opens in a class you track.",
  },
  {
    lead: "Grade history and professor ratings",
    rest: " on every course card, so you know what you're signing up for.",
  },
  {
    lead: "A schedule builder",
    rest: " that exports your week to Google or Apple Calendar.",
  },
];

export const WELCOME_SIGNOFF = "Good luck this semester!";
export const WELCOME_SIGNATURE = "The PantherWatch team";
