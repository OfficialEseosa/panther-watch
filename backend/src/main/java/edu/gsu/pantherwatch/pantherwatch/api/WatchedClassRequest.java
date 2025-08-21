package edu.gsu.pantherwatch.pantherwatch.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WatchedClassRequest {
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
}
