package edu.gsu.pantherwatch.pantherwatch;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PantherWatchApplication {

	public static void main(String[] args) {
		SpringApplication.run(PantherWatchApplication.class, args);
	}

}
