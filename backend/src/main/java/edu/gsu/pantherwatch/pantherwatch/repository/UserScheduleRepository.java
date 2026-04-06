package edu.gsu.pantherwatch.pantherwatch.repository;

import edu.gsu.pantherwatch.pantherwatch.model.UserSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserScheduleRepository extends JpaRepository<UserSchedule, Long> {
    List<UserSchedule> findByUserIdOrderByAddedAtDesc(UUID userId);
    
    List<UserSchedule> findByUserIdAndTermCodeOrderByAddedAtDesc(UUID userId, String termCode);
    
    Optional<UserSchedule> findByUserIdAndTermCodeAndCrn(UUID userId, String termCode, String crn);
    
    void deleteByUserIdAndTermCodeAndCrn(UUID userId, String termCode, String crn);
    
    void deleteByUserId(UUID userId);
}
