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
public class RetrieveCourseInfoRequest {
    @JsonProperty("txt_level")
    private String txtLevel;

    @JsonProperty("txt_subject")
    private String txtSubject;

    @JsonProperty("txt_courseNumber")
    private String txtCourseNumber;

    @JsonProperty("txt_term")
    private String txtTerm;

    @JsonProperty("pageOffset")
    @Builder.Default
    private Integer pageOffset = 0;

    @JsonProperty("pageMaxSize")
    @Builder.Default
    private Integer pageMaxSize = 10;
}
