package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.api.SendCustomEmailRequest;
import edu.gsu.pantherwatch.pantherwatch.api.SendCustomEmailResponse;
import edu.gsu.pantherwatch.pantherwatch.api.UserSearchResponse;
import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.repository.UserRepository;
import edu.gsu.pantherwatch.pantherwatch.repository.WatchedClassRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminService {
    
    private final UserRepository userRepository;
    private final WatchedClassRepository watchedClassRepository;
    private final EmailService emailService;
    
    @Value("${admin.emails:}")
    private String adminEmails;
    
    public boolean isAdmin(String email) {
        if (adminEmails == null || adminEmails.trim().isEmpty()) {
            return false;
        }
        
        Set<String> adminEmailSet = Arrays.stream(adminEmails.split(","))
                .map(String::trim)
                .map(String::toLowerCase)
                .collect(Collectors.toSet());
        
        return adminEmailSet.contains(email.toLowerCase());
    }
    
    public List<UserSearchResponse> searchUsers(String searchTerm) {
        if (searchTerm == null || searchTerm.trim().isEmpty()) {
            return List.of();
        }
        
        List<User> users = userRepository.searchByNameOrEmail(searchTerm.trim());
        
        return users.stream()
                .map(this::convertToUserSearchResponse)
                .collect(Collectors.toList());
    }
    
    public SendCustomEmailResponse sendCustomEmail(SendCustomEmailRequest request, String adminEmail) {
        log.info("Admin {} attempting to send custom email to: {}", adminEmail, request.getTargetEmail());
        
        if (!isAdmin(adminEmail)) {
            log.warn("Unauthorized access attempt by non-admin: {}", adminEmail);
            return SendCustomEmailResponse.builder()
                    .success(false)
                    .message("Unauthorized: User is not an admin")
                    .recipientEmail(request.getTargetEmail())
                    .build();
        }
        
        try {
            Optional<User> userOpt = userRepository.findByEmail(request.getTargetEmail());
            
            String userName;
            if (userOpt.isPresent()) {
                User user = userOpt.get();
                userName = user.getName() != null ? user.getName() : user.getEmail().split("@")[0];
            } else {
                userName = request.getTargetEmail().split("@")[0];
                log.warn("User not found in system for email: {}", request.getTargetEmail());
            }
            
            emailService.sendCustomEmail(
                    request.getTargetEmail(),
                    userName,
                    request.getSubject(),
                    request.getMessage()
            );
            
            log.info("Admin {} successfully sent custom email to {} with subject: {}", 
                    adminEmail, request.getTargetEmail(), request.getSubject());
            
            return SendCustomEmailResponse.builder()
                    .success(true)
                    .message("Email sent successfully")
                    .recipientEmail(request.getTargetEmail())
                    .build();
                    
        } catch (Exception e) {
            log.error("Failed to send custom email from admin {} to {}: {}", 
                    adminEmail, request.getTargetEmail(), e.getMessage(), e);
            
            return SendCustomEmailResponse.builder()
                    .success(false)
                    .message("Failed to send email: " + e.getMessage())
                    .recipientEmail(request.getTargetEmail())
                    .build();
        }
    }
    
    public List<UserSearchResponse> getAllUsers(String adminEmail) {
        if (!isAdmin(adminEmail)) {
            throw new RuntimeException("Unauthorized: User is not an admin");
        }
        
        List<User> users = userRepository.findAll();
        
        return users.stream()
                .map(this::convertToUserSearchResponse)
                .collect(Collectors.toList());
    }
    
    private UserSearchResponse convertToUserSearchResponse(User user) {
        int watchedClassesCount = (int) watchedClassRepository.countByUser(user);
        
        return UserSearchResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .picture(user.getPicture())
                .createdAt(user.getCreatedAt())
                .watchedClassesCount(watchedClassesCount)
                .build();
    }
}
