package edu.gsu.pantherwatch.pantherwatch.api;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class RetrieveCourseInfoResponse {
    @JsonProperty("success")
    private boolean success;

    @JsonProperty("totalCount")
    private int totalCount;

    @JsonProperty("data")
    private CourseData[] data;

    @JsonProperty("pageOffset")
    private int pageOffset;

    @JsonProperty("pageMaxSize")
    private int pageMaxSize;
}
