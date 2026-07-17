package edu.gsu.pantherwatch.pantherwatch.repository;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.model.WatchedClass;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WatchedClassRepository extends JpaRepository<WatchedClass, Long> {
    
    List<WatchedClass> findByUserOrderByCreatedAtDesc(User user);
    
    Optional<WatchedClass> findByUserAndCrnAndTerm(User user, String crn, String term);
    
    boolean existsByUserAndCrnAndTerm(User user, String crn, String term);
    
    void deleteByUserAndCrnAndTerm(User user, String crn, String term);

    void deleteAllByUser(User user);
    
    long countByUser(User user);

    /**
     * All watch entries with their users pre-fetched, for the watch cycle.
     * The fetch join matters: the watcher reads user email/name on async
     * threads where no Hibernate session is open (OSIV is disabled).
     */
    @Query("SELECT w FROM WatchedClass w JOIN FETCH w.user")
    List<WatchedClass> findAllWithUser();

    @Query("SELECT DISTINCT w.term FROM WatchedClass w")
    List<String> findDistinctTerms();

    @Modifying
    @Query("DELETE FROM WatchedClass w WHERE w.term IN :terms")
    int deleteByTermIn(@Param("terms") List<String> terms);
}
