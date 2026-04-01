package edu.gsu.pantherwatch.pantherwatch.repository;

import edu.gsu.pantherwatch.pantherwatch.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
    
    Optional<User> findByEmail(String email);

    @Query(value = "SELECT u FROM User u WHERE " +
           "LOWER(u.name) LIKE LOWER(CONCAT('%', :searchTerm, '%')) OR " +
           "LOWER(u.email) LIKE LOWER(CONCAT('%', :searchTerm, '%'))" +
           " ORDER BY u.createdAt DESC")
    List<User> searchByNameOrEmail(@Param("searchTerm") String searchTerm,
                                   org.springframework.data.domain.Pageable pageable);

    default List<User> searchByNameOrEmail(String searchTerm) {
        return searchByNameOrEmail(searchTerm, org.springframework.data.domain.PageRequest.of(0, 50));
    }
}
