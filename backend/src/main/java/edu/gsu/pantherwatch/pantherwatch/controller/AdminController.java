package edu.gsu.pantherwatch.pantherwatch.controller;

import edu.gsu.pantherwatch.pantherwatch.api.SendCustomEmailRequest;
import edu.gsu.pantherwatch.pantherwatch.api.SendCustomEmailResponse;
import edu.gsu.pantherwatch.pantherwatch.api.UserSearchRequest;
import edu.gsu.pantherwatch.pantherwatch.api.UserSearchResponse;
import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.AdminService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = {"http://localhost:5173", "http://localhost:3000"})
public class AdminController {
    
    private final AdminService adminService;
    
    @PostMapping("/users/search")
    public ResponseEntity<List<UserSearchResponse>> searchUsers(
            HttpServletRequest request,
            @Valid @RequestBody UserSearchRequest searchRequest) {
        
        try {
            User currentUser = (User) request.getAttribute("currentUser");
            
            if (!adminService.isAdmin(currentUser.getEmail())) {
                log.warn("Non-admin user {} attempted to search users", currentUser.getEmail());
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
            
            List<UserSearchResponse> users = adminService.searchUsers(searchRequest.getQuery());
            return ResponseEntity.ok(users);
            
        } catch (Exception e) {
            log.error("Error searching users", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @GetMapping("/users")
    public ResponseEntity<List<UserSearchResponse>> getAllUsers(HttpServletRequest request) {
        
        try {
            User currentUser = (User) request.getAttribute("currentUser");
            
            if (!adminService.isAdmin(currentUser.getEmail())) {
                log.warn("Non-admin user {} attempted to get all users", currentUser.getEmail());
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
            
            List<UserSearchResponse> users = adminService.getAllUsers(currentUser.getEmail());
            return ResponseEntity.ok(users);
            
        } catch (Exception e) {
            log.error("Error getting all users", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @PostMapping("/email/send")
    public ResponseEntity<SendCustomEmailResponse> sendCustomEmail(
            HttpServletRequest request,
            @Valid @RequestBody SendCustomEmailRequest emailRequest) {
        
        try {
            User currentUser = (User) request.getAttribute("currentUser");
            
            if (!adminService.isAdmin(currentUser.getEmail())) {
                log.warn("Non-admin user {} attempted to send custom email", currentUser.getEmail());
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(SendCustomEmailResponse.builder()
                                .success(false)
                                .message("Unauthorized: User is not an admin")
                                .recipientEmail(emailRequest.getTargetEmail())
                                .build());
            }
            
            SendCustomEmailResponse response = adminService.sendCustomEmail(emailRequest, currentUser.getEmail());
            
            if (response.isSuccess()) {
                return ResponseEntity.ok(response);
            } else {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
            }
            
        } catch (Exception e) {
            log.error("Error sending custom email", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(SendCustomEmailResponse.builder()
                            .success(false)
                            .message("Internal server error: " + e.getMessage())
                            .recipientEmail(emailRequest.getTargetEmail())
                            .build());
        }
    }
    
    @GetMapping("/check")
    public ResponseEntity<Boolean> checkAdminStatus(HttpServletRequest request) {
        
        try {
            User currentUser = (User) request.getAttribute("currentUser");
            boolean isAdmin = adminService.isAdmin(currentUser.getEmail());
            
            log.info("Admin status check for user {}: {}", currentUser.getEmail(), isAdmin);
            return ResponseEntity.ok(isAdmin);
            
        } catch (Exception e) {
            log.error("Error checking admin status", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(false);
        }
    }
}
