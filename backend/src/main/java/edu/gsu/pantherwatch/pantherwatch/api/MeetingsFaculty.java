package edu.gsu.pantherwatch.pantherwatch.api;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class MeetingsFaculty {
    @JsonProperty("category")
    private String category;

    @JsonProperty("meetingTime")
    private MeetingTime meetingTime;
}
