package edu.gsu.pantherwatch.pantherwatch.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(
    name = "user_schedules",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "term_code", "crn"})
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserSchedule {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "term_code", nullable = false, length = 10)
    private String termCode;

    @Column(nullable = false, length = 10)
    private String crn;

    @Column(name = "added_at", nullable = false)
    private LocalDateTime addedAt;

    @PrePersist
    protected void onCreate() {
        if (addedAt == null) {
            addedAt = LocalDateTime.now();
        }
    }
}
