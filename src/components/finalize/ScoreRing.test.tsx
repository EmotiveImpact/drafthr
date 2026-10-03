import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ScoreRing } from "./ScoreRing";

afterEach(cleanup);

it("shows the final health score on the first render", () => {
  render(<ScoreRing score={72} band="adequate" label="Compliance" />);

  expect(screen.getByLabelText("Compliance score 72 out of 100")).toHaveTextContent("72");
});
