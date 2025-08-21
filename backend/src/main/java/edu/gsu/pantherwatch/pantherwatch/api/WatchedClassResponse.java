package edu.gsu.pantherwatch.pantherwatch.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

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
    
    public WatchedClassResponse() {}
    
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getCrn() {
        return crn;
    }
    
    public void setCrn(String crn) {
        this.crn = crn;
    }
    
    public String getTerm() {
        return term;
    }
    
    public void setTerm(String term) {
        this.term = term;
    }
    
    public String getCourseTitle() {
        return courseTitle;
    }
    
    public void setCourseTitle(String courseTitle) {
        this.courseTitle = courseTitle;
    }
    
    public String getCourseNumber() {
        return courseNumber;
    }
    
    public void setCourseNumber(String courseNumber) {
        this.courseNumber = courseNumber;
    }
    
    public String getSubject() {
        return subject;
    }
    
    public void setSubject(String subject) {
        this.subject = subject;
    }
    
    public String getInstructor() {
        return instructor;
    }
    
    public void setInstructor(String instructor) {
        this.instructor = instructor;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
