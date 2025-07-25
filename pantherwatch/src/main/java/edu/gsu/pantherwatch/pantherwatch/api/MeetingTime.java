package edu.gsu.pantherwatch.pantherwatch.api;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class MeetingTime {
    @JsonProperty("beginTime")
    private String beginTime;

    @JsonProperty("buildingDescription")
    private String buildingDescription;

    @JsonProperty("campusDescription")
    private String campusDescription;

    @JsonProperty("category")
    private String category;

    @JsonProperty("endDate")
    private String endDate;
    
    @JsonProperty("endTime")
    private String endTime;

    @JsonProperty("friday")
    private boolean friday;

    @JsonProperty("hoursWeek")
    private int hoursWeek;

    @JsonProperty("meetingTypeDescription")
    private String meetingTypeDescription;

    @JsonProperty("monday")
    private boolean monday;

    @JsonProperty("room")
    private String room;

    @JsonProperty("saturday")
    private boolean saturday;

    @JsonProperty("startDate")
    private String startDate;

    @JsonProperty("sunday")
    private boolean sunday;

    @JsonProperty("thursday")
    private boolean thursday;

    @JsonProperty("tuesday")
    private boolean tuesday;

    @JsonProperty("wednesday")
    private boolean wednesday;
}
