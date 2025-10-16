package edu.gsu.pantherwatch.pantherwatch.repository;

import edu.gsu.pantherwatch.pantherwatch.model.EmailLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface EmailLogRepository extends JpaRepository<EmailLog, Long> {

    @Query("SELECT e FROM EmailLog e WHERE e.email = :email AND e.emailType = :emailType AND e.sentAt > :cutoffDate ORDER BY e.sentAt DESC")
    Optional<EmailLog> findRecentEmailByTypeAndEmail(
            @Param("email") String email, 
            @Param("emailType") EmailLog.EmailType emailType, 
            @Param("cutoffDate") LocalDateTime cutoffDate
    );

    @Query("SELECT COUNT(e) FROM EmailLog e WHERE e.sentAt > :cutoffDate")
    long countEmailsSentSince(@Param("cutoffDate") LocalDateTime cutoffDate);

    @Modifying
    @Transactional
    @Query("DELETE FROM EmailLog e WHERE e.sentAt < :cutoffDate")
    int deleteEmailLogsOlderThan(@Param("cutoffDate") LocalDateTime cutoffDate);
}