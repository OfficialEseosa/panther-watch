package edu.gsu.pantherwatch.pantherwatch.api;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScheduleEntryResponse {
    private Long id;
    private String termCode;
    private String crn;
    private String subject;
    private String courseNumber;
    private String courseTitle;
    private LocalDateTime addedAt;
}
