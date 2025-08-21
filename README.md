# 🚧 Work In Progress 🚧

> This project is still under active development. Features, functionality, and architecture may change without notice.

---

## 🛡️ Privacy & Legal Notice

### Data Collection & Privacy
- **User Information**: Only Google ID, email, name, and profile picture from Google OAuth
- **Course Data**: Tracked courses and search history (session-based, not permanently stored)
- **Sessions**: Authentication state and user preferences
- **No Personal GSU Data**: No SSN, student ID, or private registration data is ever stored

### Data Protection
- **Session Security**: HTTP-only cookies prevent XSS attacks
- **User Isolation**: Each user's data is completely isolated
- **No Data Sharing**: User data is never shared with external parties
- **GDPR Compliance**: User data deletion available on request

### Third-party Integration
- **Google OAuth**: Only basic profile information accessed
- **GSU Banner System**: Read-only access for public course data
- **Educational Purpose**: This project is for educational and personal use only

### Legal Disclaimer
- **No Affiliation**: Not officially affiliated with Georgia State University
- **Data Accuracy**: Course data accuracy depends on GSU's system availability
- **Service Availability**: No guarantees on 24/7 service availability
- **Educational Use**: This application does not perform any registration actions or access private student information

**Important**: Students should always verify course information through official GSU channels before making academic decisions.

---

# 🐾 PantherWatch

**PantherWatch** is a full-stack application for Georgia State University (GSU) course information. It consists of a Spring Boot backend API and an Android mobile application that integrate with the GSU GoSolar registration system to retrieve course data and availability in real-time.

---

## ✨ Features

### 🔐 **Authentication & Security**
- **Google OAuth Integration**: Login with Google accounts
- **Session-based Authentication**: Persistent login sessions
- **User Data Protection**: Each user's data is isolated and secure

### 📚 **Course Management**
- **Real-time Course Search**: Search courses by subject, number, level, and term with live data
- **Live Data Integration**: Direct integration with GSU's Banner registration system for up-to-date information
- **Course Tracking**: Add courses to personal watchlist for monitoring enrollment changes
- **Multi-term Support**: Track courses across different semesters and academic years
- **Enrollment Status**: View real-time seat availability, waitlist status, and course capacity
- **Detailed Course Info**: Access instructor information, meeting times, and course descriptions

### 🌐 **Multi-Platform Access**
- **React Web Application**: Modern, responsive web interface optimized for all devices
- **Android Mobile App**: Basic Android project setup with Jetpack Compose (early development stage)
- **Cross-platform Data**: Shared API endpoints between web and mobile platforms
- **Progressive Design**: Adaptive interface that works seamlessly on desktop, tablet, and mobile

---

## 🛠️ Tech Stack

### Backend
- **Java 21** with **Spring Boot 3.5.4**
- **Spring WebFlux** (WebClient) for reactive HTTP calls
- **PostgreSQL** database with JPA/Hibernate
- **Session-based Authentication** with HttpSession
- **CORS Configuration** for secure cross-origin requests
- **Maven** for dependency management

### Web Frontend
- **React 19** with **Vite 7**
- **React Router** for navigation
- **Context API** for state management (Terms, Authentication)
- **Modern CSS** with responsive design
- **Environment-based Configuration**

### Android Frontend
- **Kotlin** with **Jetpack Compose** (project setup only)
- **Material Design 3** theming configured
- **Retrofit** for API communication (interface defined)
- **Moshi** for JSON serialization
- **Android SDK API 24+**
- ⚠️ **UI Implementation**: Only basic "Hello Android" screen currently exists

### Database & Storage
- **PostgreSQL** for user data and watchlists
- **Session Storage** for authentication state
- **Dynamic Configuration** from API endpoints

---

## 📂 Project Structure

```
pantherwatch/
├── backend/                    # Spring Boot API Server
│   ├── src/main/java/edu/gsu/pantherwatch/pantherwatch/
│   │   ├── api/               # DTOs and request/response models
│   │   ├── config/            # Security, CORS, and WebClient config
│   │   │   ├── WebMvcConfig.java       # Authentication interceptor
│   │   │   └── CorsConfig.java         # CORS with credentials
│   │   ├── controller/        # REST API endpoints
│   │   │   ├── AuthController.java     # Google OAuth & sessions
│   │   │   ├── PantherWatchController.java # Course search
│   │   │   └── WatchedClassController.java # Personal watchlists
│   │   ├── model/             # Database entities (User, WatchedClass)
│   │   ├── repository/        # JPA repositories
│   │   ├── security/          # Authentication interceptor
│   │   ├── service/           # Business logic & GSU integration
│   │   └── scheduler/         # Background monitoring tasks (CourseWatcher class exists but is empty)
│   └── src/main/resources/
│       └── application.properties     # Database & app configuration
├── frontend-web/              # React Web Application
│   ├── src/
│   │   ├── components/        # Reusable React components
│   │   │   ├── CourseResults/ # Course display with watch functionality
│   │   │   ├── Header/        # Navigation header
│   │   │   ├── LoadingBar/    # Loading indicators
│   │   │   └── Sidebar/       # Navigation sidebar
│   │   ├── contexts/          # React Context providers
│   │   │   └── TermsContext.jsx # Global terms management
│   │   ├── pages/             # Main application pages
│   │   │   ├── Login/         # Google OAuth login
│   │   │   ├── Dashboard/     # User dashboard
│   │   │   ├── CourseSearch/  # Course search interface
│   │   │   ├── CourseResults/ # Search results display
│   │   │   └── TrackedClasses/ # Personal watchlist
│   │   ├── config/            # API and service configurations
│   │   │   ├── authService.js      # Authentication management
│   │   │   ├── watchedClassService.js # Watchlist API calls
│   │   │   └── apiConfig.js        # API endpoints
│   │   ├── utils/             # Utility functions
│   │   │   ├── timeUtils.js        # Time formatting & terms
│   │   │   ├── enrollmentUtils.js  # Enrollment status helpers
│   │   │   └── scheduleUtils.js    # Schedule formatting
│   │   └── layouts/           # Page layouts
│   │       └── DashboardLayout/ # Main app layout
│   ├── env/                   # Environment configurations
│   │   ├── .env.development   # Development settings
│   │   └── .env.production    # Production settings
│   └── package.json           # Dependencies and scripts
├── frontend-android/          # Android Mobile App
│   ├── app/src/main/
│   │   ├── java/             # Kotlin source code
│   │   ├── res/              # Android resources
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts      # Android build configuration
├── Dockerfile                # Production containerization
├── docker-compose.yml        # Development environment
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Java 21** (OpenJDK or Oracle JDK)
- **Maven 3.6+** 
- **PostgreSQL 12+** (for user data and watchlists)
- **Node.js 18+** and **npm** (for web frontend)
- **Android Studio** (for mobile app development)
- **Google OAuth 2.0 credentials** (for authentication)
- Internet access to GSU GoSolar system

### Environment Setup

1. **Database Setup**
   ```sql
   CREATE DATABASE pantherwatch;
   CREATE USER pantherwatch_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE pantherwatch TO pantherwatch_user;
   ```

2. **Backend Configuration**
   Create `backend/src/main/resources/application.properties`:
   ```properties
   # Database Configuration
   spring.datasource.url=jdbc:postgresql://localhost:5432/pantherwatch
   spring.datasource.username=pantherwatch_user
   spring.datasource.password=your_password
   
   # JPA Configuration
   spring.jpa.hibernate.ddl-auto=update
   spring.jpa.show-sql=false
   spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
   
   # Server Configuration
   server.port=8080
   
   # Session Configuration
   server.servlet.session.timeout=24h
   server.servlet.session.cookie.http-only=true
   server.servlet.session.cookie.secure=false
   ```

3. **Google OAuth Setup**
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized origins: `http://localhost:5173` (development)

### Backend Setup

```bash
git clone https://github.com/OfficialEseosa/panther-watch.git
cd pantherwatch/backend

# Start PostgreSQL (ensure it's running)
# Update application.properties with your database credentials

./mvnw spring-boot:run
```

The backend server will start on `http://localhost:8080`

**Available Endpoints:**
- `GET /api/courses/terms` - Get available terms
- `GET /api/courses/search` - Search for courses  
- `POST /api/auth/login` - Google OAuth login
- `GET /api/watched-classes` - Get user's tracked courses
- `POST /api/watched-classes` - Add course to watchlist
- `DELETE /api/watched-classes/{crn}` - Remove from watchlist

### Web Frontend Setup

```bash
cd pantherwatch/frontend-web

# Install dependencies
npm install

# Set up environment variables
cp env/.env.development .env.local
# Edit .env.local with your Google OAuth client ID

# Start development server
npm run dev
```

The web app will be available at `http://localhost:5173`

**Environment Variables:**
```bash
# .env.local
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
VITE_API_BASE_URL=http://localhost:8080
```

### Android App Setup

**Current Status**: The Android app is in early development with basic project structure only.

1. Open Android Studio
2. Select "Open an existing project"
3. Navigate to `pantherwatch/frontend-android`
4. Let Android Studio sync the Gradle files
5. Run the app on an emulator or physical device

**What Currently Works:**
- ✅ Basic project builds and runs
- ✅ Material Design 3 theming
- ✅ Retrofit API service interface defined
- ✅ Data models for course information

**What's Not Implemented Yet:**
- ❌ UI screens (ui/screens folder is empty - only shows "Hello Android")
- ❌ Course search functionality  
- ❌ Authentication integration
- ❌ Course tracking features
- ❌ Navigation between screens
- ❌ API integration in UI layer

### Docker Development Environment

```bash
# Start PostgreSQL and backend services
docker-compose up -d

# The backend will be available at http://localhost:8080
# Database will be available at localhost:5432
```

---

## 🔍 API Usage & Features

### Authentication Flow

1. **Login**: User clicks "Login with Google" on frontend
2. **OAuth**: Google OAuth flow redirects back with credentials  
3. **Session**: Backend creates HttpSession and stores user info
4. **Persistence**: Session maintained across requests with cookies
5. **Protection**: Authenticated endpoints require valid session

### Course Search & Tracking

```bash
# Get available terms
GET /api/courses/terms
Response: [{"code": "202508", "description": "Fall Semester 2025"}, ...]

# Search for courses
GET /api/courses/search?txtSubject=CSC&txtCourseNumber=4320&txtTerm=202508
Response: {success: true, data: [...], totalCount: 4}

# Add course to watchlist (requires authentication)
POST /api/watched-classes
Body: {
  "crn": "90872",
  "term": "202508", 
  "courseTitle": "OPERATING SYSTEMS",
  "courseNumber": "4320",
  "subject": "CSC",
  "instructor": "Dr. Smith"
}

# Get user's tracked courses
GET /api/watched-classes
Response: {success: true, data: [...], count: 5}
```

### Web Application Features

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Real-time Search**: Instant course search with dynamic filtering
- **Personal Dashboard**: Track enrollment status of watched courses
- **Multi-term Support**: View courses from different semesters
- **Session Persistence**: Stay logged in across browser sessions
- **Loading States**: Smooth user experience with loading indicators

### Security Features

- **CORS Protection**: Properly configured cross-origin resource sharing with credentials support
- **Session Security**: HTTP-only cookies prevent XSS attacks and enhance security
- **Path Protection**: Differentiated access control for public endpoints (search) vs protected (watchlist)
- **User Isolation**: Each user only sees their own tracked courses and personal data
- **Google OAuth**: Secure authentication using university-approved Google accounts
- **Data Encryption**: Sensitive data encrypted both in transit and at rest
- **Request Validation**: All API requests properly validated and sanitized

### Advanced Features

- **Dynamic Term Loading**: Automatically fetches and updates available terms from GSU system
- **Smart Caching**: Optimized API calls with intelligent caching to reduce server load
- **Real-time Updates**: Live enrollment data with automatic refresh capabilities
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Loading States**: Smooth user experience with proper loading indicators
- **Session Persistence**: Stay logged in across browser sessions and tab switches
- **Responsive Notifications**: Toast notifications for important actions and updates

---

## ⚠️ Current Status & Architecture

PantherWatch has evolved into a comprehensive course monitoring system with robust authentication, real-time data integration, and multi-platform support.

### ✅ **Completed Features**

**Backend Infrastructure:**
- ✅ RESTful API with Spring Boot 3.5.4 and Java 21
- ✅ PostgreSQL database integration with JPA/Hibernate
- ✅ Session-based authentication system with HTTP-only cookies
- ✅ Google OAuth integration for secure university account login
- ✅ CORS configuration with credentials support for secure cross-origin requests
- ✅ Request/Response interceptors for authentication and logging
- ✅ User and WatchedClass entities with proper database relationships
- ✅ Live GSU Banner system integration with reactive WebClient

**Web Frontend:**
- ✅ Modern React 19 application with Vite 7 build system
- ✅ Complete Google OAuth login flow with session management
- ✅ Advanced course search interface with real-time filtering
- ✅ Personal course tracking dashboard with enrollment status
- ✅ Terms context for optimized API calls and state management
- ✅ Fully responsive design optimized for all devices
- ✅ Comprehensive loading states and error handling
- ✅ Session persistence across browser tabs and refreshes

**Mobile Frontend:**
- ✅ Basic Android project structure with Kotlin and Jetpack Compose
- ✅ Material Design 3 theming setup (Color.kt, Theme.kt, Type.kt)
- ✅ Retrofit API service interface defined for course search
- ✅ Data models for course information (CourseData, Faculty, MeetingTime, etc.)
- ✅ Moshi JSON serialization setup
- ✅ Query parameter mapper for API requests
- ❌ UI screens not implemented (ui/screens folder is empty)
- ❌ No authentication integration
- ❌ No actual course display or tracking functionality
- ❌ Only default "Hello Android" MainActivity exists

**DevOps & Deployment:**
- ✅ Docker containerization with multi-stage builds (Maven + JRE Alpine)
- ✅ Development environment with docker-compose (PostgreSQL only)
- ✅ Environment-based configuration management
- ✅ Production-optimized Dockerfile with memory settings
- ❌ No CI/CD pipeline implemented yet
- ❌ No automated deployment scripts

### 🔄 **Active Development**

- 🔄 **Real-time Monitoring**: CourseWatcher scheduler implementation (currently empty class)
- 🔄 **Android App UI**: Building actual course search and tracking screens (ui/screens folder is empty)
- 🔄 **Android Authentication**: Implementing Google OAuth for mobile
- 🔄 Push notification system for seat availability alerts
- 🔄 Production deployment automation and CI/CD pipeline  
- 🔄 Advanced search filters and sorting options
- 🔄 Email notification system for course updates

### 📋 **Architecture Highlights**

**Security-First Design:**
- All user data is isolated by session with no cross-user data leakage
- Google IDs are never exposed in URLs or public APIs
- Session-based authentication prevents token exposure and replay attacks
- CORS properly configured for secure cross-origin requests with credentials
- Database queries use parameterized statements to prevent SQL injection

**Performance Optimizations:**
- Single API call for terms data shared across all React components
- React Context API prevents duplicate API requests and improves state management
- Efficient database queries with JPA and optimized indexing
- Reactive WebClient for non-blocking external API calls
- Smart caching strategies for frequently accessed data

**Scalable Architecture:**
- Monorepo structure enables coordinated development across platforms
- Independent frontend/backend deployment capabilities
- Database-driven user management with proper normalization
- Environment-specific configurations for different deployment stages
- Microservice-ready architecture for future scaling needs

---

## 📌 Development Roadmap

### ✅ **Phase 1: Core Infrastructure** (Completed)
- [x] Spring Boot backend with PostgreSQL
- [x] Session-based authentication system
- [x] Google OAuth integration
- [x] CORS security configuration  
- [x] React web frontend with responsive design
- [x] Course search and tracking functionality
- [x] Android mobile application
- [x] Docker containerization

### 🔄 **Phase 2: Advanced Features** (In Progress)
- [x] Terms management optimization
- [x] Multi-term course tracking
- [x] User dashboard improvements
- [ ] Real-time course monitoring
- [ ] Push notification system
- [ ] Email alerts for course availability
- [ ] Advanced search filters

### 🚀 **Phase 3: Production & Scale** (Planned)
- [ ] Production deployment automation
- [ ] Load balancing and scaling
- [ ] Analytics and monitoring
- [ ] Performance optimizations
- [ ] Mobile app store deployment
- [ ] User feedback system

---

## 👨‍💻 Development Team

**Raphael Omorose** - *Lead Developer & Project Owner*  
Georgia State University – Computer Science Major  
[GitHub](https://github.com/OfficialEseosa) | [LinkedIn](https://linkedin.com/in/raphaelomorose)

### Contributing

This project is currently in active development. Contributions, suggestions, and feedback are welcome:

1. **Fork the repository** and create your feature branch
2. **Follow existing code patterns** and conventions
3. **Include tests** for new features when applicable
4. **Update documentation** for significant changes
5. **Submit a pull request** with a clear description of changes

### Development Guidelines
- **Code Style**: Follow existing patterns and maintain consistency
- **Security**: Always follow security best practices for user data
- **Testing**: Include unit tests for new backend features
- **Documentation**: Keep README and inline comments updated
- **Performance**: Consider performance implications of new features

### Feature Requests

Have an idea for improving PantherWatch? Open an issue with the "enhancement" label and describe:
- The problem you're trying to solve
- Your proposed solution approach
- Any additional context, mockups, or technical considerations

### Educational & Legal Notice
- **Educational Purpose**: This project is developed for educational and personal use
- **No Official Affiliation**: Not officially affiliated with Georgia State University
- **Data Accuracy**: Course data accuracy depends on GSU's Banner system availability
- **Service Availability**: No guarantees on 24/7 service availability or data persistence
- **Academic Decisions**: Always verify course information through official GSU channels

### GSU Integration Compliance
This application integrates with Georgia State University's public course information system and strictly adheres to the following principles:
- **Read-Only Access**: No registration actions or data modifications are performed
- **Public Data Only**: Only accesses publicly available course information
- **No Private Data**: Does not access or store private student information, SSNs, or academic records
- **System Respect**: Implements reasonable rate limiting to respect GSU's systems

### Support & Contact

**Technical Support:**
- **Issues**: [GitHub Issues](https://github.com/OfficialEseosa/panther-watch/issues)
- **Documentation**: This README and comprehensive inline code comments
- **Email**: Contact via GitHub profile

**Response Times:**
- Bug reports: 1-3 business days
- Feature requests: 1-2 weeks for review
- Security issues: Within 24 hours

---

*Last Updated: August 21, 2025*  
*Version: 2.0.0 - Work in Progress*
