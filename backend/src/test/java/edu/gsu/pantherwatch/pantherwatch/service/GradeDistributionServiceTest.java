package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.api.GradeDistributionResponse;
import edu.gsu.pantherwatch.pantherwatch.model.SectionGrade;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** CSV parsing + aggregation/matching. Pure unit test: no Spring, no network, no DB. */
class GradeDistributionServiceTest {

    private final GradeDistributionService service = new GradeDistributionService(null);

    private static final String SUMMARY_CSV =
            "CRN,Course,Professor,A  (90-100),B  (80-89),C  (70-79),D  (60-69),F <60,WF,A- WF,DWF,W,CRS AVG,Other ,Total,Instruction Method\n"
            + "80104,CSC 4520 ,\"Bal, Abdullah\",33,26,1,3,1,0,64,7.7,1,3.31,0,65,T\n"
            + "83015,CSC 4520 ,\"Nemira, Alina\",21,20,15,4,2,0,62,9.7,0,2.85,0,62,T\n"
            + "91250,CSC 4520 ,\"Nemira, Alina\",22,17,8,2,0,0,49,4.1,0,3.16,0,49,T\n";

    private static final String DETAILED_CSV =
            "CRN,A+,A,A-,B+,B,B-,C+,C,C-,D,F,WF,A-WF,DWF,W,Other,Total,Instruction Method\n"
            + "80104,10,15,8,12,10,4,1,0,0,3,1,0,64,7.7,1,0,65,T\n"
            + "83015,7,9,5,8,8,4,6,7,2,4,2,0,62,9.7,0,0,62,T\n"
            + "91250,9,8,5,7,6,4,4,3,1,2,0,0,49,4.1,0,0,49,T\n";

    @Test
    void parsesCsvIntoSections() {
        List<SectionGrade> sections = service.parseTerm(SUMMARY_CSV, DETAILED_CSV, "202508");
        assertEquals(3, sections.size());

        SectionGrade nemira = sections.stream()
                .filter(s -> s.getCrn().equals("83015")).findFirst().orElseThrow();
        assertEquals("CSC", nemira.getSubject());
        assertEquals("4520", nemira.getCourseNumber());
        assertEquals("", nemira.getSection());
        assertEquals("Nemira, Alina", nemira.getProfessor());
        assertEquals(2.85, nemira.getGpa(), 0.001);
        assertEquals(62, nemira.getTotal());
        // coarse A bucket (21) == fine A+/A/A- (7+9+5)
        assertEquals(21, nemira.getAPlus() + nemira.getAFlat() + nemira.getAMinus());
    }

    @Test
    void matchesNemiraDespiteMessyGoSolarName() {
        List<SectionGrade> sections = service.parseTerm(SUMMARY_CSV, DETAILED_CSV, "202508");

        // GoSolar's display name carries a parenthetical preferred name + trailing space.
        GradeDistributionResponse resp =
                service.buildResponse("CSC", "4520", "Nemira, Alina (Alina) ", sections);

        assertTrue(resp.isHasData());
        assertTrue(resp.isInstructorHasTaught(), "Nemira should match her CSC 4520 sections");
        assertEquals("Nemira, Alina", resp.getInstructorDistribution().getProfessor());
        // Enrollment-weighted GPA across her two sections (62@2.85, 49@3.16).
        double expected = Math.round((2.85 * 62 + 3.16 * 49) / (62 + 49) * 100.0) / 100.0;
        assertEquals(expected, resp.getInstructorDistribution().getGpa(), 0.001);
        assertEquals(2, resp.getInstructorDistribution().getSectionsCount());
    }

    @Test
    void reportsNoMatchForUnknownInstructor() {
        List<SectionGrade> sections = service.parseTerm(SUMMARY_CSV, DETAILED_CSV, "202508");
        GradeDistributionResponse resp = service.buildResponse("CSC", "4520", "Nonexistent, Person", sections);
        assertTrue(resp.isHasData());
        assertFalse(resp.isInstructorHasTaught());
    }

    @Test
    void normalizesNamesAcrossSources() {
        assertEquals(
                GradeDistributionService.normalizeName("Nemira, Alina"),            // APEX
                GradeDistributionService.normalizeName("Nemira, Alina (Alina) "));  // GoSolar
        assertEquals(
                GradeDistributionService.normalizeName("Bal, Abdullah"),
                GradeDistributionService.normalizeName("Bal, Abdullah  ."));
        assertEquals("nemira|alina", GradeDistributionService.normalizeName("Nemira, Alina (Alina) "));
    }
}
