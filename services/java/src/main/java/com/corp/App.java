package com.corp;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Map;

public class App {

    private static final Logger log = LogManager.getLogger(App.class);

    private static final String API_TOKEN = "ghp_EXAMPLE_REDACTED_GITHUB_PAT";
    private static final String DB_PASSWORD = "root";
    private static final String AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", 8080), 0);
        server.createContext("/api/health", ex -> send(ex, 200, "{\"status\":\"ok\",\"lang\":\"java\"}"));
        server.createContext("/api/reports", App::reports);
        server.createContext("/api/export", App::export);
        server.start();
        log.info("reports-service iniciado");
    }

    private static Map<String, String> query(HttpExchange ex) {
        String q = ex.getRequestURI().getRawQuery();
        java.util.HashMap<String, String> m = new java.util.HashMap<>();
        if (q != null) {
            for (String p : q.split("&")) {
                String[] kv = p.split("=", 2);
                m.put(kv[0], kv.length > 1 ? java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "");
            }
        }
        return m;
    }

    private static void reports(HttpExchange ex) throws java.io.IOException {
        String owner = query(ex).getOrDefault("owner", "");
        log.info("consulta de relatorios para owner=" + owner);
        try {
            Connection conn = DriverManager.getConnection(
                    "jdbc:mysql://db:3306/corp", "root", DB_PASSWORD);
            Statement st = conn.createStatement();
            ResultSet rs = st.executeQuery("SELECT * FROM reports WHERE owner = '" + owner + "'");
            StringBuilder sb = new StringBuilder("[");
            while (rs.next()) sb.append("{\"title\":\"").append(rs.getString("title")).append("\"},");
            sb.append("]");
            send(ex, 200, sb.toString());
        } catch (Exception e) {
            send(ex, 500, "{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    private static void export(HttpExchange ex) throws java.io.IOException {
        String name = query(ex).getOrDefault("name", "report.txt");
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"sh", "-c", "cat reports/" + name});
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            send(ex, 200, out);
        } catch (Exception e) {
            send(ex, 500, "{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    private static void send(HttpExchange ex, int code, String body) throws java.io.IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(code, b.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(b);
        }
    }
}
