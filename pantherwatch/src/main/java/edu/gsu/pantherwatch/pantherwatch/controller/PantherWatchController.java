package edu.gsu.pantherwatch.pantherwatch.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ModelAttribute;

import edu.gsu.pantherwatch.pantherwatch.service.PantherWatchService;
import lombok.RequiredArgsConstructor;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoResponse;

@RestController
@RequestMapping("/api/courses")
@RequiredArgsConstructor
public class PantherWatchController {
    
    private final PantherWatchService pantherWatchService;

    @GetMapping("/search")
    public RetrieveCourseInfoResponse retrieveCourseInfo(@ModelAttribute RetrieveCourseInfoRequest request) {
        return pantherWatchService.retrieveCourseInfo(request);
    }
}
