package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.api.WatchedClassRequest;
import edu.gsu.pantherwatch.pantherwatch.api.WatchedClassResponse;
import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.model.WatchedClass;
import edu.gsu.pantherwatch.pantherwatch.repository.WatchedClassRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class WatchedClassService {

    @Autowired
    private WatchedClassRepository watchedClassRepository;

    public List<WatchedClassResponse> getWatchedClasses(User user) {
        List<WatchedClass> watchedClasses = watchedClassRepository.findByUserOrderByCreatedAtDesc(user);
        
        return watchedClasses.stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());
    }

    public WatchedClassResponse addWatchedClass(User user, WatchedClassRequest request) {
        if (watchedClassRepository.existsByUserAndCrnAndTerm(user, request.getCrn(), request.getTerm())) {
            throw new RuntimeException("You are already watching this class");
        }

        WatchedClass watchedClass = WatchedClass.builder()
                .user(user)
                .crn(request.getCrn())
                .term(request.getTerm())
                .courseTitle(request.getCourseTitle())
                .courseNumber(request.getCourseNumber())
                .subject(request.getSubject())
                .instructor(request.getInstructor())
                .build();

        WatchedClass saved = watchedClassRepository.save(watchedClass);
        return convertToResponse(saved);
    }

    @Transactional
    public boolean removeWatchedClass(User user, String crn, String term) {
        Optional<WatchedClass> watchedClass = watchedClassRepository.findByUserAndCrnAndTerm(user, crn, term);
        
        if (watchedClass.isPresent()) {
            watchedClassRepository.delete(watchedClass.get());
            return true;
        }
        
        return false;
    }

    public long getWatchedClassCount(User user) {
        return watchedClassRepository.countByUser(user);
    }

    public boolean isWatching(User user, String crn, String term) {
        return watchedClassRepository.existsByUserAndCrnAndTerm(user, crn, term);
    }

    private WatchedClassResponse convertToResponse(WatchedClass watchedClass) {
        WatchedClassResponse response = new WatchedClassResponse();
        response.setId(watchedClass.getId());
        response.setCrn(watchedClass.getCrn());
        response.setTerm(watchedClass.getTerm());
        response.setCourseTitle(watchedClass.getCourseTitle());
        response.setCourseNumber(watchedClass.getCourseNumber());
        response.setSubject(watchedClass.getSubject());
        response.setInstructor(watchedClass.getInstructor());
        response.setCreatedAt(watchedClass.getCreatedAt());
        return response;
    }
}
