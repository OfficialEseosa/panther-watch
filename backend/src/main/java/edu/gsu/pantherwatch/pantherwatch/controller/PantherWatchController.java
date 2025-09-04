package edu.gsu.pantherwatch.pantherwatch.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ModelAttribute;

import edu.gsu.pantherwatch.pantherwatch.service.PantherWatchService;
import lombok.RequiredArgsConstructor;
import edu.gsu.pantherwatch.pantherwatch.api.GetSubjectRequest;
import edu.gsu.pantherwatch.pantherwatch.api.GetSubjectResponse;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;
import edu.gsu.pantherwatch.pantherwatch.api.Terms;
import java.util.List;

@RestController
@RequestMapping("/api/courses")
@RequiredArgsConstructor
public class PantherWatchController {
    
    private final PantherWatchService pantherWatchService;

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
    public GetSubjectResponse[] getSubjects(@ModelAttribute GetSubjectRequest request) {
        List<GetSubjectResponse> subjects = pantherWatchService.getSubjects(request);
        return subjects.toArray(new GetSubjectResponse[0]);
    }
}
