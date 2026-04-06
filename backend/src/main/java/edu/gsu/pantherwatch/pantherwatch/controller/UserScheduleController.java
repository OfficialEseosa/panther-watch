package edu.gsu.pantherwatch.pantherwatch.controller;

import edu.gsu.pantherwatch.pantherwatch.api.AddScheduleEntryRequest;
import edu.gsu.pantherwatch.pantherwatch.api.ScheduleEntryResponse;
import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.UserScheduleService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/schedule")
@RequiredArgsConstructor
@Slf4j
public class UserScheduleController {

    private final UserScheduleService scheduleService;

    /**
     * GET /api/schedule - Get all schedule entries for current user, grouped by term
     */
    @GetMapping
    public ResponseEntity<Map<String, List<ScheduleEntryResponse>>> getUserSchedule(HttpServletRequest request) {
        User currentUser = (User) request.getAttribute("currentUser");
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Map<String, List<ScheduleEntryResponse>> schedule = scheduleService.getUserSchedule(currentUser.getId());
        return ResponseEntity.ok(schedule);
    }

    /**
     * GET /api/schedule/{termCode} - Get schedule entries for a specific term
     */
    @GetMapping("/{termCode}")
    public ResponseEntity<List<ScheduleEntryResponse>> getUserScheduleForTerm(
            HttpServletRequest request,
            @PathVariable String termCode) {
        User currentUser = (User) request.getAttribute("currentUser");
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<ScheduleEntryResponse> schedule = scheduleService.getUserScheduleForTerm(currentUser.getId(), termCode);
        return ResponseEntity.ok(schedule);
    }

    /**
     * POST /api/schedule - Add a course to user's schedule
     */
    @PostMapping
    public ResponseEntity<ScheduleEntryResponse> addScheduleEntry(
            HttpServletRequest request,
            @Valid @RequestBody AddScheduleEntryRequest requestBody) {
        User currentUser = (User) request.getAttribute("currentUser");
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        ScheduleEntryResponse entry = scheduleService.addScheduleEntry(
            currentUser.getId(),
            requestBody.getTermCode(),
            requestBody.getCrn()
        );
        return ResponseEntity.ok(entry);
    }

    /**
     * DELETE /api/schedule/{termCode}/{crn} - Remove a course from user's schedule
     */
    @DeleteMapping("/{termCode}/{crn}")
    public ResponseEntity<Map<String, Object>> removeScheduleEntry(
            HttpServletRequest request,
            @PathVariable String termCode,
            @PathVariable String crn) {
        User currentUser = (User) request.getAttribute("currentUser");
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        scheduleService.removeScheduleEntry(currentUser.getId(), termCode, crn);
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "Schedule entry removed");
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/schedule/sync - Sync entire schedule from client (batch update)
     * Request body: { "202601": ["12345", "67890"], "202602": ["11111"] }
     */
    @PostMapping("/sync")
    public ResponseEntity<Map<String, List<ScheduleEntryResponse>>> syncSchedule(
            HttpServletRequest request,
            @RequestBody Map<String, List<String>> scheduleByTerm) {
        User currentUser = (User) request.getAttribute("currentUser");
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Map<String, List<ScheduleEntryResponse>> syncedSchedule = scheduleService.syncSchedule(
            currentUser.getId(),
            scheduleByTerm
        );
        return ResponseEntity.ok(syncedSchedule);
    }
}
