package edu.gsu.pantherwatch.pantherwatch.controller;

import edu.gsu.pantherwatch.pantherwatch.model.Announcement;
import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.AnnouncementService;
import edu.gsu.pantherwatch.pantherwatch.service.AdminService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/announcements")
public class AnnouncementController {
    
    @Autowired
    private AnnouncementService announcementService;
    
    @Autowired
    private AdminService adminService;
    
    // Public endpoint - get active announcements
    @GetMapping("/active")
    public ResponseEntity<?> getActiveAnnouncements() {
        try {
            List<Announcement> announcements = announcementService.getActiveAnnouncements();
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", announcements);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to fetch announcements: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    // Admin endpoints - check if user is admin
    @GetMapping
    public ResponseEntity<?> getAllAnnouncements(HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");
            if (user == null || !adminService.isAdmin(user.getEmail())) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "Unauthorized: Admin access required");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
            }
            
            List<Announcement> announcements = announcementService.getAllAnnouncements();
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", announcements);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to fetch announcements: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    @PostMapping
    public ResponseEntity<?> createAnnouncement(@RequestBody Announcement announcement, HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");
            if (user == null || !adminService.isAdmin(user.getEmail())) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "Unauthorized: Admin access required");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
            }
            
            Announcement created = announcementService.createAnnouncement(announcement);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", created);
            response.put("message", "Announcement created successfully");
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to create announcement: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<?> updateAnnouncement(@PathVariable Long id, @RequestBody Announcement announcement, HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");
            if (user == null || !adminService.isAdmin(user.getEmail())) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "Unauthorized: Admin access required");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
            }
            
            Announcement updated = announcementService.updateAnnouncement(id, announcement);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", updated);
            response.put("message", "Announcement updated successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to update announcement: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteAnnouncement(@PathVariable Long id, HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");
            if (user == null || !adminService.isAdmin(user.getEmail())) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "Unauthorized: Admin access required");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
            }
            
            announcementService.deleteAnnouncement(id);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Announcement deleted successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to delete announcement: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    @PatchMapping("/{id}/deactivate")
    public ResponseEntity<?> deactivateAnnouncement(@PathVariable Long id, HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");
            if (user == null || !adminService.isAdmin(user.getEmail())) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "Unauthorized: Admin access required");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
            }
            
            announcementService.deactivateAnnouncement(id);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Announcement deactivated successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to deactivate announcement: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    @PatchMapping("/{id}/activate")
    public ResponseEntity<?> activateAnnouncement(@PathVariable Long id, HttpServletRequest request) {
        try {
            User user = (User) request.getAttribute("currentUser");
            if (user == null || !adminService.isAdmin(user.getEmail())) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "Unauthorized: Admin access required");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
            }

            announcementService.activateAnnouncement(id);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Announcement activated successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to activate announcement: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}
