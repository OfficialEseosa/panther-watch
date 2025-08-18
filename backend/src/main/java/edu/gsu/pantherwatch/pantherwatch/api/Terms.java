package edu.gsu.pantherwatch.pantherwatch.api;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Terms {
    @JsonProperty("code")
    private String code;

    @JsonProperty("description")
    private String description;
}
