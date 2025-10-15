package edu.gsu.pantherwatch.pantherwatch.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class CourseData {
    @JsonProperty("term")
    private String term;

    @JsonProperty("termDesc")
    private String termDesc;

    @JsonProperty("courseReferenceNumber")
    private String courseReferenceNumber;

    @JsonProperty("partOfTerm")
    private String partOfTerm;

    @JsonProperty("courseNumber")
    private String courseNumber;

    @JsonProperty("subject")
    private String subject;

    @JsonProperty("subjectDescription")
    private String subjectDescription;

    @JsonProperty("sequenceNumber")
    private String sequenceNumber;

    @JsonProperty("campusDescription")
    private String campusDescription;

    @JsonProperty("scheduleTypeDescription")
    private String scheduleTypeDescription;

    @JsonProperty("courseTitle")
    private String courseTitle;

    @JsonProperty("creditHours")
    private int creditHours;

    @JsonProperty("maximumEnrollment")
    private int maximumEnrollment;

    @JsonProperty("enrollment")
    private int enrollment;

    @JsonProperty("seatsAvailable")
    private int seatsAvailable;

    @JsonProperty("waitCapacity")
    private int waitCapacity;

    @JsonProperty("waitCount")
    private int waitCount;

    @JsonProperty("waitAvailable")
    private int waitAvailable;

    @JsonProperty("creditHourHigh")
    private int creditHourHigh;

    @JsonProperty("creditHourLow")
    private int creditHourLow;

    @JsonProperty("linkIdentifier")
    private String linkIdentifier;

    @JsonProperty("isSectionLinked")
    private boolean isSectionLinked;

    @JsonProperty("subjectCourse")
    private String subjectCourse;

    @JsonProperty("faculty")
    private Faculty[] faculty;

    @JsonProperty("meetingsFaculty")
    private MeetingsFaculty[] meetingsFaculty;

    
}
