# 🚧 Work In Progress 🚧

> This project is still under active development. Features, functionality, and architecture may change without notice.

---

# 🐾 PantherWatch

**PantherWatch** is a Spring Boot application for Georgia State University (GSU) course information built using **WebClient**. It integrates with the GSU GoSolar registration system to retrieve course data and availability in real-time through REST API endpoints.

---

## ✨ Features

- 🔐 **Session Management**: Automatically handles GSU GoSolar authentication with session cookies
- 🔍 **Course Search**: Search for courses by subject, course number, and term
- 📊 **Real-time Data**: Retrieves live course information from GSU's registration system
- 🌐 **REST API**: Clean HTTP endpoints for course data retrieval
- ⚡ **WebClient**: Modern reactive HTTP client for efficient API calls

---

## 🛠️ Tech Stack

- **Java 21**
- **Spring Boot 3.5.4**
- **Spring WebFlux** (WebClient)
- **Maven**
- **Lombok**

---

## 📂 Project Structure

```
pantherwatch/
├── api/                # Request/Response DTOs
│   ├── CourseData.java
│   ├── Faculty.java
│   ├── MeetingTime.java
│   └── RetrieveCourseInfo*.java
├── config/             # WebClient configuration
├── controller/         # REST API endpoints
├── service/            # Business logic and GSU API integration
├── scheduler/          # Background tasks (CourseWatcher)
└── PantherWatchApplication.java
```

---

## 🚀 Getting Started

### Prerequisites

- Java 21
- Maven 3.x
- Internet access to GSU GoSolar system

### Run Locally

```bash
git clone https://github.com/OfficialEseosa/panther-watch.git
cd pantherwatch
./mvnw spring-boot:run
```

The server will start on `http://localhost:8080`

---

## 🔍 API Usage

### Search for Courses

```bash
GET /api/courses/search?txtSubject=CSC&txtCourseNumber=1301&txtTerm=202508
```

**Parameters:**
- `txtSubject` - Course subject (e.g., "CSC", "MATH", "ENGL")
- `txtCourseNumber` - Course number (e.g., "1301", "2010")  
- `txtTerm` - Term code (e.g., "202508" for Fall 2025)

**Response:** Returns course data including sections, meeting times, faculty, and availability.

---

## ⚠️ Current Status

✅ **REST API** - Fully functional endpoints  
✅ **GSU Integration** - Live data from GoSolar registration system  
✅ **Session Management** - Automatic cookie handling  
🔄 **Frontend UI** - In development  
❌ **Real-time Notifications** - Planned for future releases

---

## 📌 Roadmap

- [x] **REST API** - Course search endpoints
- [x] **GSU Integration** - Session management and data retrieval  
- [x] **WebClient Migration** - Modern reactive HTTP client
- [ ] **Frontend Dashboard** - In development
- [ ] **Course Monitoring** - Track seat availability changes
- [ ] **Notifications** - Email/SMS alerts for course openings
- [ ] **User Accounts** - Save preferences and watchlists

---

## 👨‍💻 Author

**Raphael Omorose**  
Georgia State University – CS Major  
[GitHub](https://github.com/OfficialEseosa) | [LinkedIn](https://linkedin.com/in/raphaelomorose)

---

## 🔧 Technical Notes

- Uses Spring WebClient for reactive HTTP calls to GSU's Banner system
- Implements proper session cookie management for GSU authentication  
- Read-only operations - no registration actions are performed
- Subject to changes if GSU modifies their backend API structure
