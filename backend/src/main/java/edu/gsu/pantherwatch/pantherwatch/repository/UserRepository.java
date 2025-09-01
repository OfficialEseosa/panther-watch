package edu.gsu.pantherwatch.pantherwatch.repository;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    
    Optional<User> findByAuthUserId(UUID authUserId);
    
    Optional<User> findByEmail(String email);
    
    boolean existsByAuthUserId(UUID authUserId);
}
