import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ClientError } from "./clients";
import { oauthError } from "./config";
import { OAuthGrantError } from "./tokens";

const MAX_FORM_BYTES = 16 * 1024;

/**
 * The body of a token / revocation / registration request as form fields. OAuth bodies are
 * `application/x-www-form-urlencoded`; a JSON object is accepted too, since some clients send it.
 */
export async function readForm(request: Request): Promise<URLSearchParams> {
  const text = await request.text();
  if (text.length > MAX_FORM_BYTES) throw new OAuthGrantError("invalid_request", "request body is too large");
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new OAuthGrantError("invalid_request", "request body must be valid JSON");
    }
    const form = new URLSearchParams();
    if (json && typeof json === "object" && !Array.isArray(json)) {
      for (const [key, value] of Object.entries(json)) if (typeof value === "string") form.set(key, value);
    }
    return form;
  }
  return new URLSearchParams(text);
}

/** Maps OAuth failures to RFC 6749 §5.2 / RFC 7591 §3.2.2 error responses; anything else is a 500. */
export async function handleOAuthErrors(label: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof OAuthGrantError) {
      return oauthError(error.status, error.error, error.message, error.headers ? { headers: error.headers } : {});
    }
    if (error instanceof ClientError) {
      return oauthError(error.code === "invalid_client" ? 401 : 400, error.code, error.message);
    }
    console.error(`${label}: unhandled error`, error);
    return oauthError(500, "server_error", "Internal server error");
  }
}

/** A JSON object body, or null (the registration endpoint takes JSON, RFC 7591 §3.1). */
export async function readJsonObject(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_FORM_BYTES) throw new ClientError("invalid_client_metadata", "request body is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new ClientError("invalid_client_metadata", "request body must be a JSON object");
  }
}
