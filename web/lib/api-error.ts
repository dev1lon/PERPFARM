/**
 * What an API route is allowed to say to a visitor.
 *
 * Every route used to answer failures with `error.message` verbatim. That works
 * for the messages we WROTE for people ("No liquid Variational markets in the
 * last 24 hours") and fails badly for everything else: a browser check of the
 * calculator printed `DATABASE_URL is not set` into the results panel, and the
 * same path would have printed a Postgres error with our table and host names
 * in it.
 *
 * So the two kinds are separated at the point they are raised. A message meant
 * for a visitor is thrown as `UserFacingError` and shown as-is; anything else
 * is replaced with the route's own plain sentence and logged on the server,
 * where it belongs.
 */

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * The message to return to the caller, and the server-side log for the rest.
 *
 * `fallback` is what the visitor sees when the failure was not written for
 * them -- so it must be a complete sentence about THIS endpoint, not a generic
 * "error".
 */
export function publicMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message;
  // Everything technical stays here and never reaches the screen: the stack,
  // the driver message, and the Postgres SQLSTATE, which is what a diagnosis
  // is actually made from. A visitor gets a sentence about what failed and
  // nothing else -- an error code on a page is noise to them whatever it
  // would tell us.
  const code = (error as { code?: unknown })?.code;
  console.error(
    "[api]",
    fallback,
    typeof code === "string" ? `sqlstate=${code}` : "",
    "--",
    error instanceof Error ? error.stack ?? error.message : error,
  );
  return fallback;
}
