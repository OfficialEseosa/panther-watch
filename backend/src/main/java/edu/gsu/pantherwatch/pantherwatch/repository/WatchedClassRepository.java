package edu.gsu.pantherwatch.pantherwatch.repository;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.model.WatchedClass;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WatchedClassRepository extends JpaRepository<WatchedClass, Long> {
    
    List<WatchedClass> findByUserOrderByCreatedAtDesc(User user);
    
    Optional<WatchedClass> findByUserAndCrnAndTerm(User user, String crn, String term);
    
    boolean existsByUserAndCrnAndTerm(User user, String crn, String term);
    
    void deleteByUserAndCrnAndTerm(User user, String crn, String term);
    
    long countByUser(User user);
}
