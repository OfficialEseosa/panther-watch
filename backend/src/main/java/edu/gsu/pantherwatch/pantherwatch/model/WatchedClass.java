package edu.gsu.pantherwatch.pantherwatch.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "watched_classes")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WatchedClass {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String crn;

    @Column(nullable = false)
    private String term;

    // Course information for display purposes
    private String courseTitle;
    private String courseNumber;
    private String subject;
    private String instructor;

    // When the "seat opened" email for the current opening was sent. Cleared
    // when the class fills up again, so each seat-opening event produces
    // exactly one email instead of one every watch cycle.
    @Column(name = "notified_at")
    private LocalDateTime notifiedAt;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
