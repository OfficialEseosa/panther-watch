package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.model.Announcement;
import edu.gsu.pantherwatch.pantherwatch.repository.AnnouncementRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class AnnouncementService {
    
    @Autowired
    private AnnouncementRepository announcementRepository;
    
    public List<Announcement> getActiveAnnouncements() {
        return announcementRepository.findActiveAnnouncements(LocalDateTime.now());
    }
    
    public List<Announcement> getAllAnnouncements() {
        return announcementRepository.findAllByOrderByCreatedAtDesc();
    }
    
    public Optional<Announcement> getAnnouncementById(Long id) {
        return announcementRepository.findById(id);
    }
    
    @Transactional
    public Announcement createAnnouncement(Announcement announcement) {
        return announcementRepository.save(announcement);
    }
    
    @Transactional
    public Announcement updateAnnouncement(Long id, Announcement updatedAnnouncement) {
        return announcementRepository.findById(id)
            .map(announcement -> {
                announcement.setMessage(updatedAnnouncement.getMessage());
                announcement.setExpiresAt(updatedAnnouncement.getExpiresAt());
                announcement.setType(updatedAnnouncement.getType());
                announcement.setActive(updatedAnnouncement.getActive());
                return announcementRepository.save(announcement);
            })
            .orElseThrow(() -> new RuntimeException("Announcement not found with id: " + id));
    }
    
    @Transactional
    public void deleteAnnouncement(Long id) {
        announcementRepository.deleteById(id);
    }
    
    @Transactional
    public void deactivateAnnouncement(Long id) {
        announcementRepository.findById(id)
            .ifPresent(announcement -> {
                announcement.setActive(false);
                announcementRepository.save(announcement);
            });
    }
}
