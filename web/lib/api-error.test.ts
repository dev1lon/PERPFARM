import { afterEach, describe, expect, it, vi } from "vitest";
import { UserFacingError, publicMessage } from "./api-error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("publicMessage", () => {
  it("shows a message that was written for the visitor", () => {
    const message = "No liquid Variational markets in the last 24 hours";

    expect(publicMessage(new UserFacingError(message), "fallback")).toBe(message);
  });

  it("replaces an internal failure with the endpoint's own sentence", () => {
    // The exact case a browser check caught: this string was rendered into the
    // calculator's results panel.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const shown = publicMessage(new Error("DATABASE_URL is not set"), "Could not load market data");

    expect(shown).toBe("Could not load market data");
    expect(shown).not.toContain("DATABASE_URL");
    // The detail is kept, just server-side.
    expect(logged).toHaveBeenCalled();
    expect(String(logged.mock.calls[0])).toContain("DATABASE_URL");
  });

  it("never leaks database internals, whatever the driver throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const shown = publicMessage(
      new Error('relation "book_snapshots" does not exist at db.prod.supabase.co:5432'),
      "Could not load market data",
    );

    expect(shown).toBe("Could not load market data");
    expect(shown).not.toMatch(/supabase|book_snapshots/);
  });

  it("puts nothing technical on the screen, whatever the driver attaches", () => {
    // A visitor gets a sentence, never a code: an SQLSTATE is for our logs.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(new Error("password authentication failed"), { code: "28P01" });

    const shown = publicMessage(failure, "Could not load market data");

    expect(shown).toBe("Could not load market data");
    expect(shown).not.toMatch(/28P01|sqlstate|password/i);
    // The diagnosis is still recoverable from the server log.
    expect(String(logged.mock.calls[0])).toContain("28P01");
  });

  it("handles a thrown non-Error without crashing the route", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(publicMessage("boom", "Could not load market data")).toBe("Could not load market data");
  });
});
