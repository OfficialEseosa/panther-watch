import "server-only";

/**
 * PantherWatch's OAuth 2.1 authorization server for the MCP connector (the MCP 2026-07-28
 * authorization spec): RFC 8414 / RFC 9728 metadata, Client ID Metadata Documents and Dynamic
 * Client Registration, authorization code + PKCE (S256 only), refresh token rotation, RFC 7009
 * revocation, RFC 9207 `iss`. Tokens are random 32-byte strings stored as SHA-256 hashes.
 */
export * from "./authorize";
export * from "./client-assertion";
export * from "./clients";
export * from "./config";
export * from "./scopes";
export * from "./tokens";
