package edu.gsu.pantherwatch.pantherwatch.repository;

import edu.gsu.pantherwatch.pantherwatch.model.UserSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserScheduleRepository extends JpaRepository<UserSchedule, Long> {
    List<UserSchedule> findByUserIdOrderByAddedAtDesc(UUID userId);

    Optional<UserSchedule> findByUserIdAndTermCodeAndCrn(UUID userId, String termCode, String crn);
    
    void deleteByUserIdAndTermCodeAndCrn(UUID userId, String termCode, String crn);
    
    void deleteByUserId(UUID userId);

    @Query("SELECT DISTINCT s.termCode FROM UserSchedule s")
    List<String> findDistinctTermCodes();

    @Modifying
    @Query("DELETE FROM UserSchedule s WHERE s.termCode IN :termCodes")
    int deleteByTermCodeIn(@Param("termCodes") List<String> termCodes);
}
