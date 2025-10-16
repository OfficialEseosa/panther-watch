package edu.gsu.pantherwatch.pantherwatch.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

@Entity
@Table(name = "email_logs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmailLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private EmailType emailType;

    @Column(nullable = false)
    private LocalDateTime sentAt;

    @Column(length = 500)
    private String subject;

    public enum EmailType {
        WELCOME,
        GOODBYE,
        CLASS_AVAILABILITY
    }
}