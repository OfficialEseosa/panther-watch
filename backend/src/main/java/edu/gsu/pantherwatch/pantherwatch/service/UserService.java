package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.api.AuthRequest;
import edu.gsu.pantherwatch.pantherwatch.api.UserInfo;
import edu.gsu.pantherwatch.pantherwatch.model.User;
import edu.gsu.pantherwatch.pantherwatch.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    public User authenticateOrCreateUser(AuthRequest authRequest) {
        UserInfo userInfo = authRequest.getUser();

        Optional<User> existingUser = userRepository.findByGoogleId(userInfo.getGoogleId());
        
        if (existingUser.isPresent()) {
            User user = existingUser.get();
            user.setName(userInfo.getName());
            user.setEmail(userInfo.getEmail());
            user.setPicture(userInfo.getPicture());
            return userRepository.save(user);
        }

        existingUser = userRepository.findByEmail(userInfo.getEmail());
        
        if (existingUser.isPresent()) {
            User user = existingUser.get();
            user.setGoogleId(userInfo.getGoogleId());
            user.setName(userInfo.getName());
            user.setPicture(userInfo.getPicture());
            return userRepository.save(user);
        }

        User newUser = User.builder()
                .email(userInfo.getEmail())
                .name(userInfo.getName())
                .googleId(userInfo.getGoogleId())
                .picture(userInfo.getPicture())
                .build();
        
        return userRepository.save(newUser);
    }

    public Optional<User> findByGoogleId(String googleId) {
        return userRepository.findByGoogleId(googleId);
    }

    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    public User findById(Long id) {
        return userRepository.findById(id).orElse(null);
    }
}
