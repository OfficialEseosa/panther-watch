# PantherWatch Backend (Spring Boot)

Java 21 Spring Boot 3.5 API that proxies GSU registration endpoints, manages users and watched classes, and sends email notifications when seats open.

## Requirements
- Java 21+
- PostgreSQL 14+ (or Docker via repo `docker-compose.yml`)

## Configuration
Create `backend/.env` (loaded via spring-dotenv):
```
DB_HOST=localhost
DB_PORT=5432
POSTGRES_DB=pantherwatch
POSTGRES_USER=pantherwatch
POSTGRES_PASSWORD=pantherwatch

# Supabase auth
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# Optional (kept for completeness)
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key

# Email (Resend)
RESEND_API_KEY=your-resend-api-key

# Admins (comma-separated emails)
ADMIN_EMAILS=admin1@example.com,admin2@example.com
```
See `src/main/resources/application.properties` for how these are consumed.

## Run
```
./mvnw spring-boot:run
```
- API base: `http://localhost:8080/api`
- Health: `http://localhost:8080/actuator/health`

## Endpoints
Public (no auth):
- GET `/api/courses/terms`
- GET `/api/courses/subjects`
- GET `/api/courses/search`

Authenticated (Supabase Bearer token):
- GET/POST/DELETE `/api/watched-classes`
- GET `/api/watched-classes/check`
- GET `/api/watched-classes/count`
- GET `/api/watched-classes/full-details`

Admin (email must be in `ADMIN_EMAILS`):
- GET `/api/admin/check`
- GET `/api/admin/users`
- POST `/api/admin/users/search`
- POST `/api/admin/email/send`

## Background Job
`CourseWatcher` runs every 5 minutes and emails when seats are available and waitlist is empty. Templates in `src/main/resources/templates/email/`.

## Build Container
Root `Dockerfile` builds and runs the backend jar.
