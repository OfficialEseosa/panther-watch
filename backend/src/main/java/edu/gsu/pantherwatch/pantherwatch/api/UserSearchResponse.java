package edu.gsu.pantherwatch.pantherwatch.api;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserSearchResponse {
    private Long id;
    private String email;
    private String name;
    private String picture;
    private LocalDateTime createdAt;
    private int watchedClassesCount;
}
