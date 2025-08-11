# Dockerfile

# 1. Start with a lightweight Java 21 base image
FROM openjdk:21-jdk-slim

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy only the necessary build files first to leverage Docker's caching
# This makes future builds much faster if you haven't changed your dependencies
COPY backend/mvnw .
COPY backend/.mvn .mvn
COPY backend/pom.xml .

# 4. Download dependencies
RUN ./mvnw dependency:go-offline -B

# 5. Copy the rest of your source code
COPY backend/src ./src

# 6. Build the application into a JAR file
# The mvnw script should already have execute permissions from Git
RUN ./mvnw package -DskipTests

# 7. Tell Docker that the container will listen on port 8080
EXPOSE 8080

# 8. This is the command that will run when the container starts
CMD ["java", "-jar", "target/pantherwatch-0.0.1-SNAPSHOT.jar"]
