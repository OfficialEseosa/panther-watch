# 🚧 Work In Progress 🚧

> This project is still under active development. Features, functionality, and architecture may change without notice.

---

# 🐾 PantherWatch

**PantherWatch** is a full-stack application for Georgia State University (GSU) course information. It consists of a Spring Boot backend API and an Android mobile application that integrate with the GSU GoSolar registration system to retrieve course data and availability in real-time.

---

## ✨ Features

- 🔐 **Session Management**: Automatically handles GSU GoSolar authentication with session cookies
- 🔍 **Course Search**: Search for courses by subject, course number, and term
- 📊 **Real-time Data**: Retrieves live course information from GSU's registration system
- 🌐 **REST API**: Clean HTTP endpoints for course data retrieval
- 📱 **Android App**: Native mobile application for course searching
- ⚡ **WebClient**: Modern reactive HTTP client for efficient API calls

---

## 🛠️ Tech Stack

### Backend
- **Java 21**
- **Spring Boot 3.5.4**
- **Spring WebFlux** (WebClient)
- **Maven**
- **Lombok**

### Android Frontend
- **Kotlin**
- **Android SDK**
- **Gradle**

---

## 📂 Project Structure

```
pantherwatch/
├── backend/                    # Spring Boot API
│   ├── src/main/java/
│   │   └── edu/gsu/pantherwatch/pantherwatch/
│   │       ├── api/           # Request/Response DTOs
│   │       ├── config/        # WebClient configuration
│   │       ├── controller/    # REST API endpoints
│   │       ├── service/       # Business logic and GSU API integration
│   │       ├── scheduler/     # Background tasks
│   │       └── PantherWatchApplication.java
│   ├── src/main/resources/
│   ├── pom.xml
│   └── target/
├── frontend-android/           # Android mobile app
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/         # Kotlin source code
│   │   │   ├── res/          # Android resources
│   │   │   └── AndroidManifest.xml
│   │   └── build.gradle.kts
│   ├── gradle/
│   ├── build.gradle.kts
│   └── settings.gradle.kts
├── frontend-web/              # (WIP) React/Vite web interface (prototype)
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Java 21**
- **Maven 3.x**
- **Android Studio** (for mobile app development)
- **Android SDK API 24+**
- Internet access to GSU GoSolar system

### Backend Setup

```bash
git clone https://github.com/OfficialEseosa/panther-watch.git
cd pantherwatch/backend
./mvnw spring-boot:run
```

The backend server will start on `http://localhost:8080`

### Android App Setup

1. Open Android Studio
2. Select "Open an existing project"
3. Navigate to `pantherwatch/frontend-android`
4. Let Android Studio sync the Gradle files
5. Run the app on an emulator or physical device

---

## 🔍 API Usage

### Backend Endpoints

```bash
# Search for courses
GET /api/courses/search?txtSubject=CSC&txtCourseNumber=1301&txtTerm=202508
```

**Parameters:**
- `txtSubject` - Course subject (e.g., "CSC", "MATH", "ENGL")
- `txtCourseNumber` - Course number (e.g., "1301", "2010")  
- `txtTerm` - Term code (e.g., "202508" for Fall 2025)

**Response:** Returns course data including sections, meeting times, faculty, and availability.

### Android App
The Android app provides a native mobile interface for:
- Course searching with intuitive UI
- Real-time course availability
- Offline caching of recent searches

---

## ⚠️ Current Status

✅ **Backend API** - Fully functional REST endpoints  
✅ **GSU Integration** - Live data from GoSolar registration system  
✅ **Session Management** - Automatic cookie handling  
✅ **Android App** - Native mobile application in development  
❌ **Real-time Notifications** - Planned for future releases
❌ **Web Frontend** - In early scaffold cleanup (work in progress)

---

## 📌 Roadmap

- [x] **Backend API** - Course search endpoints
- [x] **GSU Integration** - Session management and data retrieval  
- [x] **WebClient Migration** - Modern reactive HTTP client
- [x] **Android App** - Native mobile application
- [ ] **Course Monitoring** - Track seat availability changes
- [ ] **Push Notifications** - Real-time alerts for course openings
- [ ] **User Accounts** - Save preferences and watchlists
- [ ] **Web Frontend** - Browser-based interface (in progress)

---

## 👨‍💻 Author

**Raphael Omorose**  
Georgia State University – CS Major  
[GitHub](https://github.com/OfficialEseosa) | [LinkedIn](https://linkedin.com/in/raphaelomorose)

---

## 🔧 Technical Notes

### Backend
- Uses Spring WebClient for reactive HTTP calls to GSU's Banner system
- Implements proper session cookie management for GSU authentication  
- RESTful API design with JSON responses
- Read-only operations - no registration actions are performed

### Android App  
- Native Android application built with Kotlin
- Retrofit for API communication with backend
- Material Design UI components
- Local caching for offline functionality

### Architecture
- Monorepo structure for coordinated development
- Independent deployment of backend and mobile app
- Subject to changes if GSU modifies their backend API structure
