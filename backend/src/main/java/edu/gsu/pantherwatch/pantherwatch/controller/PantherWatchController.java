package edu.gsu.pantherwatch.pantherwatch.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ModelAttribute;

import edu.gsu.pantherwatch.pantherwatch.service.GradeDistributionService;
import edu.gsu.pantherwatch.pantherwatch.service.PantherWatchService;
import edu.gsu.pantherwatch.pantherwatch.service.ProfessorRatingService;
import edu.gsu.pantherwatch.pantherwatch.service.SyllabusService;
import lombok.RequiredArgsConstructor;
import edu.gsu.pantherwatch.pantherwatch.api.GetSubjectRequest;
import edu.gsu.pantherwatch.pantherwatch.api.GetSubjectResponse;
import edu.gsu.pantherwatch.pantherwatch.api.GradeDistributionResponse;
import edu.gsu.pantherwatch.pantherwatch.api.ProfessorRating;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import edu.gsu.pantherwatch.pantherwatch.api.SyllabusInfo;
import edu.gsu.pantherwatch.pantherwatch.api.Terms;
import java.util.List;

@RestController
@RequestMapping("/api/courses")
@RequiredArgsConstructor
public class PantherWatchController {

    private final PantherWatchService pantherWatchService;
    private final GradeDistributionService gradeDistributionService;
    private final ProfessorRatingService professorRatingService;
    private final SyllabusService syllabusService;

    @GetMapping("/search")
    public RetrieveCourseInfoResponse retrieveCourseInfo(@ModelAttribute RetrieveCourseInfoRequest request) {
        RetrieveCourseInfoResponse response = pantherWatchService.searchCourses(request);
        pantherWatchService.resetRequestForm();
        return response;
    }

    @GetMapping("/terms")
    public List<Terms> getTerms() {
        return pantherWatchService.fetchAvailableTerms();
    }

    @GetMapping("/subjects")
    public List<GetSubjectResponse> getSubjects(@ModelAttribute GetSubjectRequest request) {
        return pantherWatchService.getSubjects(request);
    }

    /**
     * Historical grade distribution for a course, aggregated across recent terms.
     * When {@code instructor} is supplied, the response also resolves whether that
     * professor has taught the course and includes their specific distribution.
     */
    @GetMapping("/grades")
    public GradeDistributionResponse getGradeDistribution(
            @RequestParam String subject,
            @RequestParam String courseNumber,
            @RequestParam(required = false) String instructor) {
        return gradeDistributionService.getDistribution(subject, courseNumber, instructor);
    }

    /**
     * RateMyProfessors summary for an instructor, resolved by name against GSU.
     * Returns {@code found: false} when the professor has no RMP profile.
     */
    @GetMapping("/ratings")
    public ProfessorRating getProfessorRating(@RequestParam String professor) {
        return professorRatingService.getRating(professor);
    }

    /**
     * Whether a section has a published syllabus in GSU's public repository, plus
     * the embeddable PDF URL when it does.
     */
    @GetMapping("/syllabus")
    public SyllabusInfo getSyllabus(@RequestParam String term, @RequestParam String crn) {
        return syllabusService.get(term, crn);
    }
}
