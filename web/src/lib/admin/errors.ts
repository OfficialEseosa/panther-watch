import { z } from "zod";

/**
 * Bad input to an announcements/admin library function. Routes turn it into
 * `400 { error: { code: "invalid_request", message } }`.
 */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/** One line per zod issue, prefixed with its path: `expiresAt: must be after startsAt`. */
export function describeZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}

/** `schema.parse(input)`, but failures throw `InvalidInputError` instead of `ZodError`. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new InvalidInputError(describeZodError(result.error));
  return result.data;
}
