# -------- Build stage --------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY backend/pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY backend/src ./src
RUN mvn -q -DskipTests package

# -------- Run stage ----------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar /app/app.jar

# Koyeb will route to whatever port your app listens on.
# We'll default to 8080, but also honor $PORT if Koyeb sets it.
ENV PORT=8080

EXPOSE 8080
CMD ["java", "-jar", "/app/app.jar"]
