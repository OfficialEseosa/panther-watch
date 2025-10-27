package edu.gsu.pantherwatch.pantherwatch.repository;

import edu.gsu.pantherwatch.pantherwatch.model.Announcement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AnnouncementRepository extends JpaRepository<Announcement, Long> {
    
    @Query("SELECT a FROM Announcement a WHERE a.active = true AND (a.expiresAt IS NULL OR a.expiresAt > :now) ORDER BY a.createdAt DESC")
    List<Announcement> findActiveAnnouncements(LocalDateTime now);
    
    List<Announcement> findAllByOrderByCreatedAtDesc();
}
