package edu.gsu.pantherwatch.pantherwatch.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Talks to GSU's Oracle APEX "Grade Distributions By Course Sections" report
 * (app 140, page 184) at dssapex.gsu.edu.
 *
 * APEX is a stateful web UI: the first request 302-redirects a few times to hand
 * out a session id (p_instance) and sets affinity + Cloudflare cookies. The
 * report itself is paginated (only ~30 of hundreds of rows render per page), so
 * instead of scraping HTML we drive its built-in CSV export, which returns ALL
 * rows for the current filter in one response:
 *
 *   1. Set the term filter (session state):
 *      f?p=140:184:{session}::NO::P_TERM_184:{term}      (prefix left as "All")
 *   2. Download the full CSV for a report region:
 *      f?p=140:184:{session}:FLOW_EXCEL_OUTPUT_{regionId}_en
 *
 * The export reflects the session's current filter, so step 1 must precede step 2
 * on the same session. One term's CSV covers every subject (~7k rows).
 *
 * Uses the JDK HttpClient with a CookieManager (transparent redirect + cookie
 * replay) rather than the project's WebClient.
 */
@Component
@Slf4j
public class GradeApexClient {

    private static final String BASE = "https://dssapex.gsu.edu/ords/f";
    private static final int APP = 140;
    private static final int PAGE = 184;
    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    private static final Duration TIMEOUT = Duration.ofSeconds(60);

    private static final Pattern P_INSTANCE =
            Pattern.compile("name=\"p_instance\"[^>]*value=\"(\\d{6,})\"");

    /** An APEX session: its own HttpClient/cookie jar and p_instance. */
    public static final class Session {
        private final HttpClient http;
        private final String id;
        private final String landingHtml;

        private Session(HttpClient http, String id, String landingHtml) {
            this.http = http;
            this.id = id;
            this.landingHtml = landingHtml;
        }

        /** Landing page HTML, used to enumerate the term dropdown. */
        public String landingHtml() {
            return landingHtml;
        }
    }

    /** Bootstraps a brand-new APEX session. */
    public Session newSession() {
        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient http = HttpClient.newBuilder()
                .cookieHandler(cookies)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(TIMEOUT)
                .build();

        String landing = get(http, BASE + "?p=" + APP + ":" + PAGE + ":0");
        Matcher m = P_INSTANCE.matcher(landing);
        if (!m.find()) {
            throw new IllegalStateException("Could not establish APEX session: no p_instance in landing page");
        }
        log.info("Established APEX grade session {}", m.group(1));
        return new Session(http, m.group(1), landing);
    }

    /**
     * Sets the report's term filter (all subjects) and returns the rendered HTML.
     * The HTML is used once per run to discover the report region ids.
     */
    public String setTerm(Session session, String term) {
        return get(session.http, BASE + "?p=" + APP + ":" + PAGE + ":" + session.id
                + "::NO::P_TERM_" + PAGE + ":" + term);
    }

    /** Downloads the full CSV for a report region (reflecting the current filter). */
    public String downloadCsv(Session session, String regionId) {
        String request = "FLOW_EXCEL_OUTPUT_" + regionId + "_en";
        return get(session.http, BASE + "?p=" + APP + ":" + PAGE + ":" + session.id + ":" + request);
    }

    private String get(HttpClient http, String url) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(TIMEOUT)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "text/html,application/xhtml+xml,text/csv,*/*")
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("APEX GET {} returned status {}", url, resp.statusCode());
            }
            return resp.body();
        } catch (Exception e) {
            throw new RuntimeException("APEX request failed: " + url, e);
        }
    }
}
