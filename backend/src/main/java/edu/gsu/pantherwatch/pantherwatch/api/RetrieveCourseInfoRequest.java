package edu.gsu.pantherwatch.pantherwatch.api;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class RetrieveCourseInfoRequest {
    @JsonProperty("txt_level")
    private String txtLevel;

    @JsonProperty("txt_subject")
    private String txtSubject;

    @JsonProperty("txt_courseNumber")
    private String txtCourseNumber;

    @JsonProperty("txt_term")
    private String txtTerm;
}
