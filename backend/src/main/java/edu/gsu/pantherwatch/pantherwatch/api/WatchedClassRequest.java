package edu.gsu.pantherwatch.pantherwatch.api;

import com.fasterxml.jackson.annotation.JsonProperty;

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
    
    public WatchedClassRequest() {}
    
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
}
