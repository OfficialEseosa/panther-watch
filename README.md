# 🚧 Work In Progress 🚧

> This project is still under active development. Features, functionality, and architecture may change without notice.

---

# 🐾 PantherWatch

**PantherWatch** is a lightweight course availability tracker for Georgia State University (GSU) built using **Spring Boot** and **WebClient**. It automates class availability checks from the GoSolar registration system and makes that data programmatically accessible through a local backend.

---

## ✨ Features

- 🔐 Authenticates with GSU GoSolar registration backend using session cookies and CSRF tokens
- 🗕️ Tracks open/closed status of GSU courses in real-time
- 📂 Session manager handles automatic cookie + token refresh
- 🔸 REST API interface for course availability (coming soon)
- 📊 Future plans for frontend UI and notification integration

---

## 🛠️ Tech Stack

- **Java 21**
- **Spring Boot 3**
- **WebClient (Reactor Netty)**
- **Maven**
- **HTML parsing (regex or Jsoup in future versions)**

---

## 📂 Project Structure

```
pantherwatch/
├── config/             # WebClient config and base settings
├── controller/         # REST endpoints (WIP)
├── service/            # Business logic
├── session/            # Cookie + token manager
└── PantherWatchApplication.java
```

---

## 🚀 Getting Started

### Prerequisites

- Java 21
- Maven 3.x
- Internet access (GSU GoSolar requires live session cookies)

### Run Locally

```bash
git clone https://github.com/yourusername/pantherwatch.git
cd pantherwatch
mvn spring-boot:run
```

---

## 🔍 Example Usage

Once the server is running:

```bash
GET http://localhost:8080/api/status       # Returns session & token status
POST http://localhost:8080/api/query       # WIP: Returns course availability
```

---

## ⚠️ Limitations

- Currently in **read-only** mode — no registration actions are performed
- Limited to **public endpoints** of GoSolar
- Subject to change if GoSolar or Banner backend changes structure

---

## 📌 Roadmap

- [x] Session cookie + token manager
- [ ] Course lookup API
- [ ] Frontend dashboard (React or Vue)
- [ ] Email/text alerts on course open
- [ ] Persistent user preferences

---

## 👨‍💻 Author

**Raphael Omorose**  
Georgia State University – CS Major  
[GitHub](https://github.com/yourusername) | [LinkedIn](https://linkedin.com/in/yourprofile)

---

## 📄 License

This project is licensed under the MIT License.
