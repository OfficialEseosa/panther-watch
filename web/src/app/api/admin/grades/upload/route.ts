import type { NextRequest } from "next/server";
import { InvalidInputError } from "@/lib/admin/errors";
import { uploadGradeTerm } from "@/lib/admin/grades";
import { adminJson, apiError, guardAdmin, handleErrors, NO_STORE } from "@/lib/admin/route";

/** Per file. Note Vercel Functions cap the whole request body at 4.5 MB regardless. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Both files plus multipart overhead; checked from Content-Length before reading the body. */
const MAX_BODY_BYTES = 2 * MAX_FILE_BYTES + 64 * 1024;

/**
 * POST /api/admin/grades/upload: the primary way to load grade distributions. APEX blocks
 * non-browser clients with a Cloudflare challenge, so the admin exports the two CSVs for a
 * term in a browser and uploads them here.
 *
 * multipart/form-data: term (6-digit code), summary (file), detailed (file); max 10 MB each.
 * -> 200 { term, rows, posted }  (posted=false: no CRS AVG yet; nothing stored)
 * -> 400 { error: { code: "invalid_request", message } } naming the bad field/file and why
 * -> 413 { error: { code: "file_too_large", ... } }
 */
export async function POST(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request, { mutation: true });
    if (guard.response) return guard.response;

    const tooLarge = () =>
      apiError(413, "file_too_large", "Each file must be at most 10 MB", { headers: NO_STORE });
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new InvalidInputError("request body must be multipart/form-data with term, summary and detailed");
    }

    const term = form.get("term");
    if (typeof term !== "string") throw new InvalidInputError("term: required");
    const files: Record<"summary" | "detailed", File> = {} as Record<"summary" | "detailed", File>;
    for (const field of ["summary", "detailed"] as const) {
      const value = form.get(field);
      if (!(value instanceof File)) throw new InvalidInputError(`${field}: a CSV file is required`);
      if (value.size === 0) throw new InvalidInputError(`${field}: the file is empty`);
      if (value.size > MAX_FILE_BYTES) return tooLarge();
      files[field] = value;
    }

    const result = await uploadGradeTerm({
      term: term.trim(),
      summaryCsv: await files.summary.text(),
      detailedCsv: await files.detailed.text(),
    });
    return adminJson(result);
  });
}
