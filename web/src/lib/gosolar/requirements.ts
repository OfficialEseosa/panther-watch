import { getSubjects } from "./client";
import { GoSolarAffinityError, GoSolarError } from "./errors";
import { asGoSolarError, resolveOptions, type GoSolarOptions } from "./http";
import {
  parseCorequisites,
  parseCourseDescription,
  parsePrerequisites,
  parseRestrictions,
  subjectResolver,
  type Corequisite,
  type Prerequisites,
  type Restrictions,
} from "./requirements-html";
import { createGoSolarSession, type GoSolarSession } from "./session";
import type { Subject } from "./types";

export * from "./requirements-html";

/** Prerequisites, corequisites, restrictions and catalog description of one section. */
export interface SectionRequirements {
  term: string;
  crn: string;
  /** Catalog description, line breaks kept; null when Banner has none. */
  description: string | null;
  /** Null when the section has no prerequisites. */
  prerequisites: Prerequisites | null;
  /** Empty when there are none. */
  corequisites: Corequisite[];
  restrictions: Restrictions;
  /**
   * Plain text of a fragment whose markup the parser did not recognize (so nothing is lost
   * silently). Absent when everything parsed.
   */
  unparsed?: { corequisites?: string; restrictions?: string };
}

/**
 * Banner 9's per-section fragment endpoints. They take the CRN directly (unlike the search,
 * which ignores CRN filters) and answer HTML. `section` is the fragment's
 * `<section aria-labelledby=...>`, used to tell a real answer from an error or login page.
 */
const ENDPOINTS = {
  prerequisites: { path: "/searchResults/getSectionPrerequisites", section: "preReqs" },
  corequisites: { path: "/searchResults/getCorequisites", section: "coReqs" },
  restrictions: { path: "/searchResults/getRestrictions", section: "restrictions" },
  description: { path: "/searchResults/getCourseDescription", section: "courseDescription" },
} as const;

/** GoSolar's whole subject list for a term is ~175 entries; one page covers it. */
const SUBJECT_LIST_MAX = 1000;

/**
 * Fetches and parses all four requirement fragments of (term, crn). One GoSolar session
 * (term declaration on a fresh single-connection Agent, see session.ts); the four POSTs are
 * issued together and queue on that session's socket. In parallel, the term's subject list
 * is fetched to turn Banner's subject descriptions ("COMPUTER SCIENCE") into codes ("CSC");
 * if that lookup fails, `subject` is null and `subjectDescription` still holds the name.
 *
 * Every failure (non-2xx, timeout, socket error, an HTML error/login page instead of the
 * fragment, `success:true, data:null`) throws GoSolarError. Each request has the usual
 * per-call timeout (`timeoutMs`, default 10 s).
 */
export async function getSectionRequirements(
  term: string,
  crn: string,
  options?: GoSolarOptions,
): Promise<SectionRequirements> {
  const { baseUrl } = resolveOptions(options);
  const subjectsTask: Promise<Subject[]> = getSubjects(
    { searchTerm: "", term, offset: 1, max: SUBJECT_LIST_MAX },
    options,
  ).catch((error: unknown) => {
    console.warn(
      `GoSolar subject list for ${term} unavailable; requirement subjects stay unresolved:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  });

  let session: GoSolarSession | undefined;
  try {
    session = await createGoSolarSession(term, options);
    const open = session;
    const form = { term, courseReferenceNumber: crn };
    const fetchFragment = async ({ path, section }: { path: string; section: string }) => {
      const html = await open.postFragment(path, form);
      assertFragment(html, section, `${baseUrl}${path}`, open);
      return html;
    };
    const [prerequisitesHtml, corequisitesHtml, restrictionsHtml, descriptionHtml] = await Promise.all([
      fetchFragment(ENDPOINTS.prerequisites),
      fetchFragment(ENDPOINTS.corequisites),
      fetchFragment(ENDPOINTS.restrictions),
      fetchFragment(ENDPOINTS.description),
    ]);

    const resolveSubject = subjectResolver(await subjectsTask);
    const { corequisites, unparsed: corequisitesText } = parseCorequisites(corequisitesHtml, resolveSubject);
    const { restrictions, unparsed: restrictionsText } = parseRestrictions(restrictionsHtml);
    const result: SectionRequirements = {
      term,
      crn,
      description: parseCourseDescription(descriptionHtml),
      prerequisites: parsePrerequisites(prerequisitesHtml, resolveSubject),
      corequisites,
      restrictions,
    };
    if (corequisitesText || restrictionsText) {
      result.unparsed = {
        ...(corequisitesText ? { corequisites: corequisitesText } : {}),
        ...(restrictionsText ? { restrictions: restrictionsText } : {}),
      };
    }
    return result;
  } catch (error) {
    throw asGoSolarError(error, `${baseUrl}/term/search`);
  } finally {
    await session?.close();
  }
}

/**
 * Throws unless `html` is the expected fragment. A JSON `data:null` body means the request
 * reached a node without our term declaration (F5 affinity lost, see session.ts); anything
 * else (a maintenance or login page, an empty body) is an unexpected upstream answer.
 */
function assertFragment(html: string, section: string, url: string, session: GoSolarSession): void {
  if (new RegExp(`<section\\b[^>]*aria-labelledby=["']${section}["']`, "i").test(html)) return;
  const body = html.trim();
  if (body.startsWith("{")) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      // fall through to the generic error
    }
    if (parsed && typeof parsed === "object" && "data" in parsed && parsed.data === null) {
      throw new GoSolarAffinityError(url, session.cookieNames());
    }
  }
  throw new GoSolarError(`GoSolar returned an unexpected page instead of the ${section} fragment`, 200, url);
}
