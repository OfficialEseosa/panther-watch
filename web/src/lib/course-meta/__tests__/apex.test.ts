import { describe, expect, it } from "vitest";
import {
  APEX_BASE_URL,
  createApexSession,
  downloadTermCsvs,
  extractRegionIds,
  parsePInstance,
  parseTermOptions,
} from "../grades/apex";
import { CourseMetaHttpError, createCookieJar } from "../http";
import { fakeFetch, response } from "./fake-fetch";
import { fixture } from "./fixtures";

const PAGE = fixture("apex-page-184.html");

describe("APEX HTML parsing", () => {
  it("extracts p_instance", () => {
    expect(parsePInstance(PAGE)).toBe("13926150374803");
    expect(parsePInstance('<input type="hidden" name="p_instance" value="12345" />')).toBeNull(); // < 6 digits
    expect(parsePInstance("<html></html>")).toBeNull();
  });

  it("lists six-digit term options newest first, deduplicated", () => {
    expect(parseTermOptions(PAGE)).toEqual(["202608", "202601", "202508", "202505"]);
  });

  it("finds the summary (Professor) and detailed (A+) regions", () => {
    expect(extractRegionIds(PAGE)).toEqual({ summary: "R40828346286637", detailed: "R40828346286712" });
  });

  it("throws when a region is missing", () => {
    expect(() => extractRegionIds("<div data-region-id='R1'><table><th>Professor</th></table></div>")).toThrow(
      /detailed=none/,
    );
  });
});

describe("cookie jar", () => {
  it("honours domain, path and deletion", () => {
    const jar = createCookieJar(() => 1_000_000);
    jar.store("https://dssapex.gsu.edu/ords/f?p=1", [
      "ORA_WWV_APP_140=abc; path=/ords/; secure; HttpOnly",
      "__cf_bm=cf; Domain=.gsu.edu; Path=/; Max-Age=1800",
      "evil=1; Domain=example.com",
    ]);
    expect(jar.header("https://dssapex.gsu.edu/ords/f")).toBe("ORA_WWV_APP_140=abc; __cf_bm=cf");
    expect(jar.header("https://cdn.gsu.edu/other")).toBe("__cf_bm=cf");
    expect(jar.header("https://dssapex.gsu.edu/")).toBe("__cf_bm=cf");
    jar.store("https://dssapex.gsu.edu/ords/f", ["ORA_WWV_APP_140=; path=/ords/; Max-Age=0"]);
    expect(jar.header("https://dssapex.gsu.edu/ords/f")).toBe("__cf_bm=cf");
  });
});

describe("createApexSession", () => {
  it("follows the redirect chain by hand, carrying cookies set on every hop", async () => {
    const { fetchImpl, calls } = fakeFetch(
      response({
        status: 302,
        headers: { Location: "/ords/f?p=140:184:0:::::&cs=1" },
        setCookies: ["__cf_bm=cf1; path=/; domain=.gsu.edu; HttpOnly; Secure"],
      }),
      response({
        status: 302,
        headers: { Location: "https://dssapex.gsu.edu/ords/f?p=140:184:13926150374803" },
        setCookies: ["ORA_WWV_APP_140=sess; path=/ords/; secure; HttpOnly"],
      }),
      response({ body: PAGE }),
    );

    const session = await createApexSession({ fetchImpl });
    try {
      expect(session.id).toBe("13926150374803");
      expect(session.terms).toEqual(["202608", "202601", "202508", "202505"]);
    } finally {
      await session.close();
    }

    expect(calls.map((c) => c.url)).toEqual([
      `${APEX_BASE_URL}?p=140:184:0`,
      "https://dssapex.gsu.edu/ords/f?p=140:184:0:::::&cs=1",
      "https://dssapex.gsu.edu/ords/f?p=140:184:13926150374803",
    ]);
    for (const call of calls) {
      expect(call.init.redirect).toBe("manual");
      expect(call.init.headers["User-Agent"]).toMatch(/Chrome/);
      expect(call.init.dispatcher).toBe(calls[0].init.dispatcher);
      expect(call.init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(calls[0].init.headers.Cookie).toBeUndefined();
    expect(calls[1].init.headers.Cookie).toBe("__cf_bm=cf1");
    expect(calls[2].init.headers.Cookie).toBe("__cf_bm=cf1; ORA_WWV_APP_140=sess");
  });

  it("sets the term and downloads both region CSVs on the same session", async () => {
    const { fetchImpl, calls } = fakeFetch(
      response({ body: PAGE, setCookies: ["ORA_WWV_APP_140=sess; path=/ords/"] }),
      response({ body: PAGE }),
      response({ body: "CRN,Course,Professor\n" }),
      response({ body: "CRN,A+,A\n" }),
    );
    const session = await createApexSession({ fetchImpl });
    const csvs = await downloadTermCsvs(session, "202508");
    await session.close();

    expect(csvs).toEqual({
      term: "202508",
      regionIds: { summary: "R40828346286637", detailed: "R40828346286712" },
      summaryCsv: "CRN,Course,Professor\n",
      detailedCsv: "CRN,A+,A\n",
    });
    expect(calls.slice(1).map((c) => c.url)).toEqual([
      `${APEX_BASE_URL}?p=140:184:13926150374803::NO::P_TERM_184:202508`,
      `${APEX_BASE_URL}?p=140:184:13926150374803:FLOW_EXCEL_OUTPUT_R40828346286637_en`,
      `${APEX_BASE_URL}?p=140:184:13926150374803:FLOW_EXCEL_OUTPUT_R40828346286712_en`,
    ]);
    expect(calls[3].init.headers.Cookie).toBe("ORA_WWV_APP_140=sess");
  });

  it("throws on a non-2xx landing page (e.g. Cloudflare's 403) instead of parsing it", async () => {
    const { fetchImpl } = fakeFetch(response({ status: 403, body: "<title>Site Unavailable</title>" }));
    await expect(createApexSession({ fetchImpl })).rejects.toBeInstanceOf(CourseMetaHttpError);
  });

  it("throws when the landing page has no p_instance", async () => {
    const { fetchImpl } = fakeFetch(response({ body: "<html>maintenance</html>" }));
    await expect(createApexSession({ fetchImpl })).rejects.toThrow(/p_instance/);
  });

  it("rejects malformed term codes before calling APEX", async () => {
    const { fetchImpl, calls } = fakeFetch(response({ body: PAGE }));
    const session = await createApexSession({ fetchImpl });
    await expect(session.setTerm("2025:08")).rejects.toThrow(/Invalid term/);
    await session.close();
    expect(calls).toHaveLength(1);
  });
});
