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

    @JsonProperty("sunday")
    private boolean sunday;

    @JsonProperty("monday")
    private boolean monday;

    @JsonProperty("tuesday")
    private boolean tuesday;

    @JsonProperty("wednesday")
    private boolean wednesday;

    @JsonProperty("thursday")
    private boolean thursday;

    @JsonProperty("friday")
    private boolean friday;

    @JsonProperty("saturday")
    private boolean saturday;

    @JsonProperty("hoursWeek")
    private int hoursWeek;

    @JsonProperty("meetingTypeDescription")
    private String meetingTypeDescription;

    @JsonProperty("room")
    private String room;

    @JsonProperty("startDate")
    private String startDate;
}
