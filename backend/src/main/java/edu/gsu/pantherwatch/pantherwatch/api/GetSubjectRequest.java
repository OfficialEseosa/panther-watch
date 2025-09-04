package edu.gsu.pantherwatch.pantherwatch.api;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class GetSubjectRequest {
    @JsonProperty("searchTerm")
    private String searchTerm;

    @JsonProperty("term")
    private String term;

    @JsonProperty("offset")
    private int offset = 1;

    @JsonProperty("max")
    private int max = 10;
}
