import { describe, expect, it } from "vitest";
import { GoSolarAffinityError, GoSolarError } from "../errors";
import { GOSOLAR_BASE_URL } from "../http";
import { createGoSolarSession, joinSetCookies } from "../session";
import { DECLARE_OK, fakeFetch, response } from "./fake-fetch";

describe("joinSetCookies", () => {
  it("keeps only name=value and joins with '; '", () => {
    expect(
      joinSetCookies([
        "JSESSIONID=abc123; Path=/StudentRegistrationSsb; Secure; HttpOnly",
        "BIGipServerregistration.gosolar.gsu.edu=1234.5678.0000; path=/; Httponly; Secure",
      ]),
    ).toBe("JSESSIONID=abc123; BIGipServerregistration.gosolar.gsu.edu=1234.5678.0000");
  });

  it("returns an empty string when there are no cookies", () => {
    expect(joinSetCookies([])).toBe("");
  });
});

describe("createGoSolarSession", () => {
  it("POSTs the term declaration with form body, manual redirects and XHR headers", async () => {
    const { fetchImpl, calls } = fakeFetch(DECLARE_OK());
    const session = await createGoSolarSession("202608", { fetchImpl });
    await session.close();

    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe(`${GOSOLAR_BASE_URL}/term/search`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe("term=202608");
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher).toBeDefined();
    expect(init.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    });
    expect(session.cookies).toBe(
      "JSESSIONID=abc123; BIGipServerregistration.gosolar.gsu.edu=1234.5678.0000",
    );
  });

  it("accepts a 302 on the declaration and keeps its cookies", async () => {
    const { fetchImpl } = fakeFetch(response({ status: 302, setCookies: ["JSESSIONID=xyz; Path=/"] }));
    const session = await createGoSolarSession("202608", { fetchImpl });
    expect(session.cookies).toBe("JSESSIONID=xyz");
    await session.close();
  });

  it("rejects a 500 on the declaration", async () => {
    const { fetchImpl } = fakeFetch(response({ status: 500 }));
    await expect(createGoSolarSession("202608", { fetchImpl })).rejects.toMatchObject({
      name: "GoSolarError",
      status: 500,
    });
  });

  it("rejects a declaration without cookies", async () => {
    const { fetchImpl } = fakeFetch(response({ status: 200 }));
    await expect(createGoSolarSession("202608", { fetchImpl })).rejects.toBeInstanceOf(GoSolarError);
  });

  it("sends the session cookies and the same dispatcher on search", async () => {
    const { fetchImpl, calls } = fakeFetch(
      DECLARE_OK(),
      response({ body: { success: true, totalCount: 0, data: [], pageOffset: 0, pageMaxSize: 200 } }),
    );
    await using session = await createGoSolarSession("202608", { fetchImpl });
    await session.search({ subject: "CSC" });

    expect(calls[1].init.headers.Cookie).toBe(session.cookies);
    expect(calls[1].init.dispatcher).toBe(calls[0].init.dispatcher);
  });

  it("throws GoSolarAffinityError on success:true with data:null", async () => {
    const { fetchImpl } = fakeFetch(
      DECLARE_OK(),
      response({ body: { success: true, totalCount: 0, data: null, pageOffset: 0, pageMaxSize: 200 } }),
    );
    await using session = await createGoSolarSession("202608", { fetchImpl });
    await expect(session.search({ subject: "CSC" })).rejects.toBeInstanceOf(GoSolarAffinityError);
  });

  it("close() is idempotent and backs Symbol.asyncDispose", async () => {
    const { fetchImpl } = fakeFetch(DECLARE_OK());
    const session = await createGoSolarSession("202608", { fetchImpl });
    await session[Symbol.asyncDispose]();
    await expect(session.close()).resolves.toBeUndefined();
  });
});
