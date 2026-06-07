package edu.gsu.pantherwatch.pantherwatch.api;

import lombok.Builder;
import lombok.Data;

/**
 * Whether a section has a published syllabus in GSU's public syllabi repository,
 * and the embeddable PDF URL when it does.
 */
@Data
@Builder
public class SyllabusInfo {
    private String term;
    private String crn;

    /** True when a syllabus PDF exists for this term + CRN. */
    private boolean available;

    /** Public CloudFront URL of the PDF, or null when none is published. */
    private String url;
}
