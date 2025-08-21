package edu.gsu.pantherwatch.pantherwatch.api;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AuthRequest {
    @JsonProperty("token")
    private String token;
    
    @JsonProperty("user")
    private UserInfo user;
    
    public AuthRequest() {}
    
    public String getToken() {
        return token;
    }
    
    public void setToken(String token) {
        this.token = token;
    }
    
    public UserInfo getUser() {
        return user;
    }
    
    public void setUser(UserInfo user) {
        this.user = user;
    }
    
    public static class UserInfo {
        @JsonProperty("email")
        private String email;
        
        @JsonProperty("name")
        private String name;
        
        @JsonProperty("picture")
        private String picture;
        
        @JsonProperty("emailVerified")
        private Boolean emailVerified;
        
        @JsonProperty("sub")
        private String googleId;
        
        public UserInfo() {}
        
        public String getEmail() {
            return email;
        }
        
        public void setEmail(String email) {
            this.email = email;
        }
        
        public String getName() {
            return name;
        }
        
        public void setName(String name) {
            this.name = name;
        }
        
        public String getPicture() {
            return picture;
        }
        
        public void setPicture(String picture) {
            this.picture = picture;
        }
        
        public Boolean getEmailVerified() {
            return emailVerified;
        }
        
        public void setEmailVerified(Boolean emailVerified) {
            this.emailVerified = emailVerified;
        }
        
        public String getGoogleId() {
            return googleId;
        }
        
        public void setGoogleId(String googleId) {
            this.googleId = googleId;
        }
    }
}
