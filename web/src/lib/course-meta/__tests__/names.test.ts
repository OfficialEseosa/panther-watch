import { describe, expect, it } from "vitest";
import { foldLastName, parseName, professorKey, sameProfessor } from "../names";

describe("professorKey (ported from GradeDistributionServiceTest.normalizesNamesAcrossSources)", () => {
  it("collapses APEX and messy GoSolar spellings to one key", () => {
    expect(professorKey("Nemira, Alina")).toBe(professorKey("Nemira, Alina (Alina) "));
    expect(professorKey("Bal, Abdullah")).toBe(professorKey("Bal, Abdullah  ."));
    expect(professorKey("Nemira, Alina (Alina) ")).toBe("nemira|alina");
  });
});

describe("parseName", () => {
  it("parses 'Last, First (Preferred)'", () => {
    expect(parseName("Nemira, Alina (Alina) ")).toEqual({
      first: "Alina",
      last: "Nemira",
      preferred: "Alina",
      key: "nemira|alina",
    });
  });

  it("parses 'First Last' to the same key as 'Last, First'", () => {
    expect(parseName("Alina Nemira")).toEqual({ first: "Alina", last: "Nemira", key: "nemira|alina" });
    expect(sameProfessor("Alina Nemira", "Nemira, Alina")).toBe(true);
  });

  it("ignores middle names and initials", () => {
    expect(professorKey("Dayananda, Mathes A.")).toBe("dayananda|mathes");
    expect(professorKey("Mathes A. Dayananda")).toBe("dayananda|mathes");
    expect(professorKey("Saghaeiannejad Esfahani, Sayed Hossein")).toBe("saghaeiannejad esfahani|sayed");
  });

  it("drops generational suffixes on either side of the comma", () => {
    expect(parseName("Smith Jr., Edward")).toMatchObject({ first: "Edward", last: "Smith", key: "smith|edward" });
    expect(professorKey("Smith, Edward, Jr.")).toBe("smith|edward");
    expect(professorKey("Edward Smith III")).toBe("smith|edward");
    expect(foldLastName("Martinez Jr.")).toBe("martinez");
  });

  it("folds diacritics and drops punctuation except hyphens", () => {
    expect(professorKey("Muñoz-García, José")).toBe("munoz-garcia|jose");
    expect(professorKey("José Muñoz-García")).toBe("munoz-garcia|jose");
    expect(professorKey("O'Brien, Seán")).toBe("obrien|sean");
    expect(parseName("Muñoz-García, José")?.last).toBe("Muñoz-García");
  });

  it("returns null for blank and placeholder names", () => {
    expect(parseName(null)).toBeNull();
    expect(parseName("   ")).toBeNull();
    expect(parseName("TBA")).toBeNull();
    expect(parseName(" (Staff) ")).toBeNull();
    expect(professorKey(undefined)).toBeNull();
    expect(sameProfessor(null, null)).toBe(false);
  });

  it("keeps single-token names as a last name", () => {
    expect(parseName("Staffordshire")).toEqual({ first: "", last: "Staffordshire", key: "staffordshire|" });
  });

  it("distinguishes different first names with the same last name", () => {
    expect(sameProfessor("Smith, Alice", "Smith, Robert")).toBe(false);
  });
});
