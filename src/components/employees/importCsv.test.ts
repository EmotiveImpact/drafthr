import { describe, expect, it } from "vitest";
import { employeeCsvTemplate, readDate, readEmployeesCsv, UNREADABLE } from "./importCsv";

describe("readDate", () => {
  it("reads ISO, UK day-first and written dates", () => {
    expect(readDate("2023-03-03")).toBe("2023-03-03");
    expect(readDate("03/04/2023")).toBe("2023-04-03");
    expect(readDate("3 Mar 2023")).toBe("2023-03-03");
    expect(readDate("14 September 2021")).toBe("2021-09-14");
  });
  it("rejects impossible or unknown dates", () => {
    expect(readDate("31/02/2023")).toBeNull();
    expect(readDate("next week")).toBeNull();
  });
});

describe("readEmployeesCsv", () => {
  it("maps columns, keeps good rows and skips missing names and people already in the directory", () => {
    const csv = [
      "Name,Email,Job title,Department,Start date,Status,Manager",
      "Nadia Brooks,nadia@x.co.uk,Operative,Operations,2025-02-03,active,Ruth Adeyemi",
      ",nobody@x.co.uk,Cleaner,Facilities,,,",
      "Jordan Hale,j@x.co.uk,Lead,Operations,,,",
      "Owen Price,,Driver,Logistics,soon,on leave,",
      "Owen Price,,Driver,Logistics,,,",
      "Ama Mensah,,,,,contractor-ish,",
    ].join("\n");
    const { rows, error } = readEmployeesCsv(csv, ["Jordan  Hale"]);
    expect(error).toBeUndefined();
    expect(rows.map((r) => [r.name, r.skip])).toEqual([
      ["Nadia Brooks", false],
      ["", true],
      ["Jordan Hale", true],
      ["Owen Price", false],
      ["Owen Price", true],
      ["Ama Mensah", false],
    ]);
    expect(rows[0].values).toMatchObject({
      legalName: "Nadia Brooks",
      email: "nadia@x.co.uk",
      jobTitle: "Operative",
      department: "Operations",
      startDate: "2025-02-03",
      status: "active",
      managerName: "Ruth Adeyemi",
    });
    expect(rows[2].warnings[0]).toMatch(/Already in the directory/);
    expect(rows[3].values).toMatchObject({ status: "on-leave", startDate: undefined });
    expect(rows[3].warnings[0]).toMatch(/could not be read/);
    expect(rows[4].warnings[0]).toMatch(/twice/);
    expect(rows[5].values?.status).toBe("active");
    expect(rows[5].warnings[0]).toMatch(/not one we know/);
  });

  it("needs a name column", () => {
    expect(readEmployeesCsv("email,department\na@b.c,Ops\n", []).error).toMatch(/no name column/);
  });

  it("says when a file cannot be read", () => {
    expect(readEmployeesCsv('name\n"unterminated', []).error).toBe(UNREADABLE);
    expect(readEmployeesCsv("", []).error).toBe(UNREADABLE);
  });

  it("offers a template whose header it can read back", () => {
    const { error, rows } = readEmployeesCsv(employeeCsvTemplate() + "Jane Patel,,,,,,,,\n", []);
    expect(error).toBeUndefined();
    expect(rows[0].values?.legalName).toBe("Jane Patel");
  });
});
