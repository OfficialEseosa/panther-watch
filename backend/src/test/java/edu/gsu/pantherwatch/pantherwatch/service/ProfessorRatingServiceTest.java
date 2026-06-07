package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.api.ProfessorRating;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfessorRatingServiceTest {

    /** A stub RMP client that returns a canned hit list without any network calls. */
    private static ProfessorRatingService serviceReturning(List<RmpClient.Teacher> hits) {
        RmpClient stub = new RmpClient() {
            @Override
            public List<RmpClient.Teacher> searchTeachers(String text) {
                return hits;
            }
        };
        return new ProfessorRatingService(stub);
    }

    private static RmpClient.Teacher teacher(String first, String last, int legacyId, int numRatings, double rating) {
        return new RmpClient.Teacher(legacyId, first, last, "Computer Science", rating, 4.7, numRatings, 33.3,
                new int[] {1, 0, 0, 0, 2}, List.of(new RmpClient.Tag("Tough grader", 3)));
    }

    @Test
    void matchesMessyGoSolarNameToRmpProfile() {
        ProfessorRatingService service = serviceReturning(List.of(teacher("Alina", "Nemira", 3119831, 3, 1.7)));

        ProfessorRating rating = service.getRating("Nemira, Alina (Alina) ");

        assertTrue(rating.isFound());
        assertEquals("Alina Nemira", rating.getMatchedName());
        assertEquals(3119831, rating.getLegacyId());
        assertEquals(1.7, rating.getAvgRating());
        assertTrue(rating.getProfileUrl().endsWith("/3119831"));
    }

    @Test
    void reportsNotFoundWhenRmpHasNoMatch() {
        ProfessorRatingService service = serviceReturning(List.of());

        ProfessorRating rating = service.getRating("Doe, Jane");

        assertFalse(rating.isFound());
    }

    @Test
    void prefersExactFirstNameOverOtherSameLastName() {
        // Two professors share the last name; the one whose first name matches wins,
        // even though the other has more ratings.
        ProfessorRatingService service = serviceReturning(List.of(
                teacher("Robert", "Smith", 111, 50, 4.0),
                teacher("Alice", "Smith", 222, 5, 3.0)));

        ProfessorRating rating = service.getRating("Smith, Alice");

        assertTrue(rating.isFound());
        assertEquals(222, rating.getLegacyId());
    }

    @Test
    void skipsLookupForTba() {
        ProfessorRatingService service = serviceReturning(List.of(teacher("X", "Y", 1, 1, 5.0)));

        assertFalse(service.getRating("TBA").isFound());
        assertFalse(service.getRating(null).isFound());
    }
}
