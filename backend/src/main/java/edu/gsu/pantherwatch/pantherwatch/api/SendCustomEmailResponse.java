package edu.gsu.pantherwatch.pantherwatch.api;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SendCustomEmailResponse {
    
    private boolean success;
    private String message;
    private String recipientEmail;
}
