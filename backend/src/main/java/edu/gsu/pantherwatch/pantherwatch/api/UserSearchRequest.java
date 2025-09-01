package edu.gsu.pantherwatch.pantherwatch.api;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserSearchRequest {
    
    @NotBlank(message = "Search query is required")
    private String query;
}
