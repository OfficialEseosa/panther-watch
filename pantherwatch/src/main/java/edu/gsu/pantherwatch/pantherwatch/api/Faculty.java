package edu.gsu.pantherwatch.pantherwatch.api;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Faculty {
    @JsonProperty("banner_id")
    private String bannerId;

    @JsonProperty("courseReferenceNumber")
    private String courseReferenceNumber;

    @JsonProperty("displayName")
    private String displayName;

    @JsonProperty("emailAddress")
    private String emailAddress;

    @JsonProperty("primaryIndicator")
    private String primaryIndicator;
}
