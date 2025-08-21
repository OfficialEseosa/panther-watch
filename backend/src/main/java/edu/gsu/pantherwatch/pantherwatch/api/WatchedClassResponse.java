package edu.gsu.pantherwatch.pantherwatch.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WatchedClassResponse {
    @JsonProperty("id")
    private Long id;
    
    @JsonProperty("crn")
    private String crn;
    
    @JsonProperty("term")
    private String term;
    
    @JsonProperty("courseTitle")
    private String courseTitle;
    
    @JsonProperty("courseNumber")
    private String courseNumber;
    
    @JsonProperty("subject")
    private String subject;
    
    @JsonProperty("instructor")
    private String instructor;
    
    @JsonProperty("createdAt")
    private LocalDateTime createdAt;
}
