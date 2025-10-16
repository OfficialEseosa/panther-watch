package edu.gsu.pantherwatch.pantherwatch.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AddScheduleEntryRequest {
    @NotBlank(message = "Term code is required")
    @Size(max = 10, message = "Term code must not exceed 10 characters")
    private String termCode;

    @NotBlank(message = "CRN is required")
    @Size(max = 10, message = "CRN must not exceed 10 characters")
    private String crn;
}
