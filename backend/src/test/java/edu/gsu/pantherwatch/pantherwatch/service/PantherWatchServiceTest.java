package edu.gsu.pantherwatch.pantherwatch.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import edu.gsu.pantherwatch.pantherwatch.api.RetrieveCourseInfoRequest;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

class PantherWatchServiceTest {

    @Test
    void searchCoursesForwardsLevelToGoSolar() throws IOException {
        AtomicReference<String> searchQuery = new AtomicReference<>();
        HttpServer server = startCourseSearchServer(searchQuery);

        try {
            PantherWatchService service = newService(server);
            service.searchCourses(RetrieveCourseInfoRequest.builder()
                    .txtTerm("202608")
                    .txtSubject("CSC")
                    .txtCourseNumber("8228")
                    .txtLevel("US")
                    .build());

            assertThat(searchQuery.get()).contains("txt_level=US");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void searchCoursesOmitsBlankLevel() throws IOException {
        AtomicReference<String> searchQuery = new AtomicReference<>();
        HttpServer server = startCourseSearchServer(searchQuery);

        try {
            PantherWatchService service = newService(server);
            service.searchCourses(RetrieveCourseInfoRequest.builder()
                    .txtTerm("202608")
                    .txtSubject("CSC")
                    .txtCourseNumber("8228")
                    .txtLevel("")
                    .build());

            assertThat(searchQuery.get()).doesNotContain("txt_level");
        } finally {
            server.stop(0);
        }
    }

    private PantherWatchService newService(HttpServer server) {
        String baseUrl = "http://localhost:" + server.getAddress().getPort();
        return new PantherWatchService(WebClient.builder().baseUrl(baseUrl).build());
    }

    private HttpServer startCourseSearchServer(AtomicReference<String> searchQuery) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/term/search", exchange -> {
            exchange.getRequestBody().close();
            exchange.getResponseHeaders().add("Set-Cookie", "JSESSIONID=test-session; Path=/");
            writeJson(exchange, "{\"success\":true}");
        });
        server.createContext("/searchResults/searchResults", exchange -> {
            searchQuery.set(exchange.getRequestURI().getRawQuery());
            exchange.getRequestBody().close();
            writeJson(exchange, "{\"success\":true,\"totalCount\":0,\"data\":[],\"pageOffset\":0,\"pageMaxSize\":10}");
        });
        server.start();
        return server;
    }

    private void writeJson(com.sun.net.httpserver.HttpExchange exchange, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(body);
        }
    }
}
