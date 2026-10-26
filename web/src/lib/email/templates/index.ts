export type { RenderedEmail } from "./layout";
export { renderWelcomeEmail, WELCOME_SUBJECT, type WelcomeTemplateInput } from "./welcome";
export { renderGoodbyeEmail, GOODBYE_SUBJECT, type GoodbyeTemplateInput } from "./goodbye";
export {
  renderClassAvailabilityEmail,
  classAvailabilitySubject,
  type AvailabilityCourse,
  type ClassAvailabilityTemplateInput,
} from "./class-availability";
export { renderCustomEmail, type CustomTemplateInput } from "./custom";
