package edu.gsu.pantherwatch.pantherwatch.controller;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserService userService;

    @DeleteMapping("/me")
    public ResponseEntity<Map<String, Object>> deleteOwnAccount(HttpServletRequest request) {
        Map<String, Object> response = new HashMap<>();

        try {
            User currentUser = (User) request.getAttribute("currentUser");
            if (currentUser == null) {
                response.put("success", false);
                response.put("message", "Unauthorized: user context not found");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
            }

            userService.deleteUserAccount(currentUser);
            response.put("success", true);
            response.put("message", "Account deleted successfully");
            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {
            response.put("success", false);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);

        } catch (Exception e) {
            log.error("Failed to delete account", e);
            response.put("success", false);
            response.put("message", "Failed to delete account: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }
}
