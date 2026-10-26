import { describe, expect, it } from "vitest";
import {
  compareSections,
  courseCode,
  creditsLabel,
  firstName,
  formatTimeRange,
  greetingName,
  instructorOf,
  partOfTermName,
  plural,
  sectionKey,
  shouldCountUp,
  termLabel,
  termName,
  titleCase,
} from "./index";

const credits = (creditHours: number, creditHourLow = Number.NaN, creditHourHigh = Number.NaN) => ({
  creditHours,
  creditHourLow,
  creditHourHigh,
});

describe("lib/format", () => {
  it("labels terms", () => {
    expect(termLabel("202608")).toBe("Fall 2026");
    expect(termLabel("202601")).toBe("Spring 2026");
    expect(termLabel("202603")).toBe("202603");
    expect(termLabel(null)).toBe("");
    expect(termName("202608", "Fall Semester 2026 (View only)")).toBe("Fall Semester 2026");
    expect(termName("202608", null)).toBe("Fall 2026");
  });

  it("formats time ranges with thin spaces", () => {
    expect(formatTimeRange(600, 675)).toBe("10:00 – 11:15 AM");
    expect(formatTimeRange(660, 735)).toBe("11:00 AM – 12:15 PM");
  });

  it("labels credits for one section or a sum, with an en dash range", () => {
    expect(creditsLabel(credits(3))).toBe("3 credits");
    expect(creditsLabel(credits(1, 1))).toBe("1 credit");
    expect(creditsLabel(credits(Number.NaN, 1, 4))).toBe("1–4 credits");
    expect(creditsLabel([credits(3), credits(4)])).toBe("7 credits");
    expect(creditsLabel(credits(Number.NaN))).toBeNull();
  });

  it("builds course codes, keys and instructor names", () => {
    expect(courseCode({ subject: "CSC", courseNumber: "2720" })).toBe("CSC 2720");
    expect(courseCode("MATH", "2211")).toBe("MATH 2211");
    expect(courseCode("CSC", null)).toBe("CSC");
    expect(sectionKey("202608", "80001")).toBe("202608|80001");
    expect(
      instructorOf({
        faculty: [
          { bannerId: null, courseReferenceNumber: "1", displayName: "B, Second", emailAddress: null, primaryIndicator: false },
          { bannerId: null, courseReferenceNumber: "1", displayName: " A, Primary ", emailAddress: null, primaryIndicator: true },
        ],
      }),
    ).toBe("A, Primary");
    expect(instructorOf({ faculty: [] })).toBeNull();
    expect(
      instructorOf({
        faculty: [{ bannerId: null, courseReferenceNumber: "1", displayName: "Charlton, Ryan .", emailAddress: null, primaryIndicator: true }],
      }),
    ).toBe("Charlton, Ryan");
  });

  it("pluralizes with thousands separators", () => {
    expect(plural(1, "section")).toBe("1 section");
    expect(plural(1204, "user")).toBe("1,204 users");
    expect(plural(2, "match", "matches")).toBe("2 matches");
  });

  it("greets by first name, then the email's local part, then 'there'", () => {
    expect(firstName("  Jane   Doe ")).toBe("Jane");
    expect(greetingName("Jane Doe")).toBe("Jane");
    expect(greetingName({ name: null, email: "jdoe1@student.gsu.edu" })).toBe("jdoe1");
    expect(greetingName("  ")).toBe("there");
    expect(greetingName(null)).toBe("there");
  });

  it("counts up only integers 10-999", () => {
    expect(shouldCountUp(9)).toBe(false);
    expect(shouldCountUp(10)).toBe(true);
    expect(shouldCountUp(999)).toBe(true);
    expect(shouldCountUp(1000)).toBe(false);
    expect(shouldCountUp(null)).toBe(false);
  });

  it("orders sections by subject, number, section, CRN (numeric-aware)", () => {
    const s = (subject: string, courseNumber: string, sequenceNumber: string, crn: string) => ({
      subject,
      courseNumber,
      sequenceNumber,
      courseReferenceNumber: crn,
    });
    const list = [s("MATH", "2211", "001", "3"), s("CSC", "1302", "010", "2"), s("CSC", "1302", "002", "1"), s("CSC", "1301", "001", "4")];
    expect(list.sort(compareSections).map((x) => x.courseReferenceNumber)).toEqual(["4", "1", "2", "3"]);
  });
});

describe("titleCase", () => {
  it("title-cases GoSolar's all-caps titles", () => {
    expect(titleCase("PRINCIPLES OF COMPUTER SCI II")).toBe("Principles of Computer Sci II");
    expect(titleCase("HON: ENGLISH COMPOSITION I")).toBe("Hon: English Composition I");
    expect(titleCase("INTRO TO INFO SECURITY AND PRI")).toBe("Intro to Info Security and Pri");
    expect(titleCase("THE BRONTE SISTERS")).toBe("The Bronte Sisters");
    expect(titleCase("T THE BRONTE SISTERS")).toBe("T The Bronte Sisters");
    expect(titleCase("HON; ENGLISH COMPOSITION II")).toBe("Hon; English Composition II");
    expect(titleCase("TOPICS IN REST & 18TH-C LIT")).toBe("Topics in Rest & 18th-C Lit");
    expect(titleCase("DESIGN & ANALYSIS: ALGORITHMS")).toBe("Design & Analysis: Algorithms");
    expect(titleCase("HON DESIGN &ANALYSIS:ALGORITHM")).toBe("Hon Design &Analysis:Algorithm");
    expect(titleCase("SOFTWARE DEVELOPMENT-CTW")).toBe("Software Development-CTW");
    expect(titleCase("ETH/SOC ISSUES IN COMPUTING")).toBe("Eth/Soc Issues in Computing");
    expect(titleCase("WOMEN'S HISTORY")).toBe("Women's History");
  });

  it("keeps acronyms and roman numerals in capitals", () => {
    expect(titleCase("INTRO TO EXPLAINABLE AI")).toBe("Intro to Explainable AI");
    expect(titleCase("AP CS PRINCIPLES")).toBe("AP CS Principles");
    expect(titleCase("US HISTORY AT GSU")).toBe("US History at GSU");
    expect(titleCase("CALCULUS III")).toBe("Calculus III");
    expect(titleCase("FRENCH IV")).toBe("French IV");
    expect(titleCase("PHD PROSEMINAR")).toBe("PhD Proseminar");
    expect(titleCase("3D MODELING")).toBe("3D Modeling");
  });

  it("leaves mixed-case titles alone", () => {
    expect(titleCase("Data Structures")).toBe("Data Structures");
    expect(titleCase("")).toBe("");
  });
});

describe("partOfTermName", () => {
  it("maps only the full-term code; other codes are shown as-is", () => {
    expect(partOfTermName("1")).toBe("Full term");
    expect(partOfTermName(" E ")).toBe("E");
    expect(partOfTermName(" ")).toBeNull();
    expect(partOfTermName(null)).toBeNull();
  });
});
