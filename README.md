# 🐾 PantherWatch

> **A modern course tracking application for Georgia State University students**

PantherWatch is a full-stack web application that helps GSU students monitor course availability, track enrollment changes, and manage their academic planning. Built with Spring Boot, React, and Supabase authentication.

![Project Status](https://img.shields.io/badge/Status-Active%20Development-orange)
![Backend](https://img.shields.io/badge/Backend-Spring%20Boot%203.5.4-green)
![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite%207-blue)
![Database](https://img.shields.io/badge/Database-PostgreSQL-336791)

---

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Java 21** or higher ([Download](https://adoptium.net/temurin/releases/))
- **Node.js 18+** ([Download](https://nodejs.org/))
- **PostgreSQL 14+** ([Download](https://www.postgresql.org/download/)) *or Docker Desktop for containerized database*
- **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop/)) *recommended for easy setup*
- **Git** ([Download](https://git-scm.com/downloads))

### 1. Clone the Repository

```bash
git clone https://github.com/OfficialEseosa/panther-watch.git
cd panther-watch
```

### 2. Backend Setup (Spring Boot)

#### Create Database
```sql
-- Connect to PostgreSQL as superuser
CREATE DATABASE pantherwatch;
CREATE USER pantherwatch WITH PASSWORD 'pantherwatch';
GRANT ALL PRIVILEGES ON DATABASE pantherwatch TO pantherwatch;
```

#### Configure Environment Variables
Create a `.env` file in the `backend` directory:

```bash
cd backend
```

Create `backend/.env`:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
POSTGRES_DB=pantherwatch
POSTGRES_USER=pantherwatch
POSTGRES_PASSWORD=pantherwatch

# Supabase Configuration (Required for Authentication)
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

#### Install Dependencies and Run
```bash
# Install dependencies and start the backend
./mvnw clean install
./mvnw spring-boot:run

# Backend will start on http://localhost:8080
```

### 3. Frontend Setup (React)

#### Install Dependencies
```bash
cd ../frontend-web
npm install
```

#### Configure Environment Variables
The frontend uses environment files in the `env/` directory:

**For Development** - Update `env/.env.development`:
```env
VITE_API_BASE=http://localhost:8080
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**For Production** - Update `env/.env.production`:
```env
VITE_API_BASE=https://your-backend-domain.com
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

#### Start Development Server
```bash
npm run dev

# Frontend will start on http://localhost:5173
```

### 4. Supabase Authentication Setup

PantherWatch uses Supabase for user authentication. You'll need to:

1. **Create a Supabase Project**: Go to [supabase.com](https://supabase.com) and create a new project
2. **Enable Google OAuth**: 
   - Go to Authentication → Providers → Google
   - Enable Google provider
   - Add your Google OAuth credentials
3. **Configure Redirect URLs**:
   - Development: `http://localhost:5173/dashboard`
   - Production: `https://your-domain.com/dashboard`
4. **Get Your Keys**: Copy the project URL, anon key, and JWT secret to your environment files

### 5. Verification

1. **Backend Health Check**: Visit `http://localhost:8080/api/health` (should return 200 OK)
2. **Frontend Access**: Visit `http://localhost:5173` (should show login page)
3. **Database Connection**: Check backend logs for successful database connection
4. **Authentication Test**: Try logging in with Google OAuth

### 🐳 Alternative: Docker Setup (Recommended)

If you prefer using Docker Desktop for easier setup:

1. **Install Docker Desktop**: Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/)

2. **Clone and Start Services**:
```bash
git clone https://github.com/OfficialEseosa/panther-watch.git
cd panther-watch

# Start PostgreSQL with Docker
docker-compose up -d

# Set up backend environment (.env file as described above)
cd backend
# Create .env file with your Supabase credentials

# Start backend
./mvnw spring-boot:run

# In another terminal, start frontend
cd ../frontend-web
npm install
npm run dev
```

3. **Docker Commands**:
```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f postgres

# Stop services
docker-compose down

# Rebuild if needed
docker-compose down && docker-compose up --build -d
```

The Docker setup provides:
- **PostgreSQL database** automatically configured on port 5432
- **Persistent data storage** with Docker volumes
- **Easy cleanup** and consistent environment across machines

---

## 🏗️ Project Architecture

### Current Tech Stack

**Backend (Spring Boot)**
- **Java 21** with Spring Boot 3.5.4
- **Spring Security** with JWT authentication
- **PostgreSQL** database with JPA/Hibernate
- **WebClient** for reactive HTTP calls to GSU systems
- **Maven** for dependency management

**Frontend (React)**
- **React 19** with Vite 7 for fast development
- **React Router** for navigation
- **Supabase JavaScript Client** for authentication
- **Context API** for state management
- **Modern CSS** with responsive design

**Authentication & Security**
- **Supabase Auth** with Google OAuth 2.0
- **JWT tokens** for secure API communication
- **CORS** configured for cross-origin requests
- **Environment-based** configuration

### Project Structure

```
pantherwatch/
├── backend/                    # Spring Boot API Server
│   ├── src/main/java/edu/gsu/pantherwatch/pantherwatch/
│   │   ├── api/               # DTOs and response models
│   │   ├── config/            # Security and configuration
│   │   ├── controller/        # REST API endpoints
│   │   ├── model/             # Database entities
│   │   ├── repository/        # Data access layer
│   │   ├── security/          # Authentication logic
│   │   └── service/           # Business logic
│   ├── .env                   # Environment variables
│   └── pom.xml               # Maven dependencies
├── frontend-web/              # React Web Application
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/            # Application pages
│   │   ├── config/           # API and auth configuration
│   │   ├── contexts/         # React Context providers
│   │   └── utils/            # Utility functions
│   ├── env/                  # Environment configurations
│   │   ├── .env.development  # Development settings
│   │   └── .env.production   # Production settings
│   └── package.json          # Node.js dependencies
└── README.md                 # This file
```

---

## ✨ Features

### 🔐 **Authentication & Security**
- **Google OAuth 2.0** integration via Supabase
- **JWT-based** API authentication
- **Secure session** management
- **User data isolation** and privacy protection

### 📚 **Course Management**
- **Real-time course search** by subject, number, and term
- **Live enrollment data** from GSU Banner system
- **Course tracking** and watchlist functionality
- **Multi-term support** for academic planning
- **Detailed course information** including schedules and instructors

### 🌐 **Modern Web Experience**
- **Responsive design** for desktop, tablet, and mobile
- **Fast loading** with Vite development server
- **Progressive enhancement** for reliability
- **Intuitive navigation** with React Router

---

## 🔧 Development

### Backend Development

```bash
cd backend

# Run with auto-reload
./mvnw spring-boot:run

# Run tests
./mvnw test

# Build for production
./mvnw clean package
```

### Frontend Development

```bash
cd frontend-web

# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint
```

### Database Management

```bash
# Connect to PostgreSQL
psql -h localhost -U pantherwatch -d pantherwatch

# View tables
\dt

# View user data
SELECT * FROM users;
SELECT * FROM watched_class;
```

---

## 🚀 Deployment

### Backend Deployment

**Recommended Platforms:**
- **Railway** (PostgreSQL + Spring Boot)
- **Render** (with PostgreSQL add-on)
- **Heroku** (with Heroku Postgres)

**Environment Variables for Production:**
```env
DB_HOST=your-production-db-host
DB_PORT=5432
POSTGRES_DB=your-production-db-name
POSTGRES_USER=your-production-db-user
POSTGRES_PASSWORD=your-production-db-password
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

### Frontend Deployment

**Recommended Platforms:**
- **Vercel** (automatic Git deployment)
- **Netlify** (with environment variables)
- **Cloudflare Pages**

**Build Configuration:**
```json
{
  "build": {
    "command": "npm run build",
    "directory": "frontend-web",
    "output": "dist"
  }
}
```

---

## 📊 Current State

### ✅ Completed Features
- [x] **Authentication System**: Complete Google OAuth integration
- [x] **Course Search**: Real-time GSU course data retrieval
- [x] **User Management**: Database schema and user operations
- [x] **Course Tracking**: Add/remove courses from personal watchlist
- [x] **Responsive UI**: Modern React interface with mobile support
- [x] **API Integration**: Full backend API with Spring Boot
- [x] **Security**: JWT authentication and CORS configuration

### 🚧 In Development
- [ ] **Real-time Notifications**: Email/SMS alerts for course availability
- [ ] **Advanced Filtering**: Complex search criteria and saved searches
- [ ] **Schedule Builder**: Visual course schedule planning

### 🎯 Future Roadmap

**Phase 1: Enhanced Functionality** (Next 2-3 months)
- [ ] **Automated Monitoring**: Background service for enrollment changes
- [ ] **Email Notifications**: Course availability alerts
- [ ] **Advanced Search**: Filters by time, instructor, location
- [ ] **Schedule Visualization**: Calendar view of course schedules

**Phase 2: Mobile Experience** (3-6 months)
- [ ] **PWA Support**: Offline functionality and app-like experience
- [ ] **Push Notifications**: Real-time mobile alerts
- [ ] **Android App**: Native mobile application
- [ ] **iOS App**: Native iOS application

**Phase 3: Social Features** (6+ months)
- [ ] **Course Reviews**: Student-generated course feedback
- [ ] **Study Groups**: Connect with classmates

---

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow existing code style and conventions
- Add tests for new functionality
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

## 📜 Legal & Privacy

### Data Collection & Privacy
- **User Information**: Only Google ID, email, name, and profile picture from Google OAuth
- **Course Data**: Tracked courses and search history (user-specific)
- **No Personal GSU Data**: No SSN, student ID, or private registration data stored
- **GDPR Compliance**: User data deletion available on request

### Disclaimer
- **Educational Purpose**: This project is for educational and personal use
- **No Affiliation**: Not officially affiliated with Georgia State University
- **Data Accuracy**: Course data accuracy depends on GSU's system availability
- **Verification**: Students should verify course information through official GSU channels

---

## 📞 Support

### Common Issues

**Backend won't start:**
- Check Java version: `java --version` (should be 21+)
- Verify PostgreSQL is running: `pg_isready -h localhost -p 5432`
- Check environment variables in `.env` file

**Frontend build errors:**
- Clear node modules: `rm -rf node_modules && npm install`
- Check Node.js version: `node --version` (should be 18+)
- Verify environment variables in `env/.env.development`

**Authentication not working:**
- Verify Supabase project configuration
- Check Google OAuth client settings
- Ensure redirect URLs match your environment

**Docker Desktop issues:**
- Ensure Docker Desktop is running and properly configured
- Check that ports 5432 (PostgreSQL) and 8080 (backend) are available
- Try rebuilding containers: `docker-compose down && docker-compose up --build`

### Getting Help
- **Issues**: [GitHub Issues](https://github.com/OfficialEseosa/panther-watch/issues)
- **Discussions**: [GitHub Discussions](https://github.com/OfficialEseosa/panther-watch/discussions)
- **Email**: Contact the development team

**Built with ❤️ for Georgia State University students**
