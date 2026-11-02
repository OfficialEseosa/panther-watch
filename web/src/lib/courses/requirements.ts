import "server-only";
import { z } from "zod";
import {
  getSectionRequirements as fetchSectionRequirements,
  type GoSolarOptions,
  type SectionRequirements,
} from "@/lib/gosolar";
import { gosolarOptions } from "./gosolar-options";
import { crnSchema, termCodeSchema } from "./validation";

export type { SectionRequirements };

export const sectionRequirementsSchema = z.object({
  term: termCodeSchema,
  crn: crnSchema,
});
export type SectionRequirementsInput = z.input<typeof sectionRequirementsSchema>;

/**
 * Prerequisites, corequisites, restrictions and catalog description of one section, straight
 * from GoSolar (one session, four fragment requests plus the subject list). Throws a ZodError
 * for invalid input and GoSolarError when GoSolar fails (routes map it to 502).
 */
export async function getSectionRequirements(
  input: SectionRequirementsInput,
  options: GoSolarOptions | undefined = gosolarOptions(),
): Promise<SectionRequirements> {
  const { term, crn } = sectionRequirementsSchema.parse(input);
  return fetchSectionRequirements(term, crn, options);
}
