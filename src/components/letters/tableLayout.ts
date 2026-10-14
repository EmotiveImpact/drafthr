/**
 * Column widths for the letters table (LettersTable), worked out from what
 * the rows actually hold and how wide the table is.
 *
 * Fixed shares gave "Where it is" room it did not need while matter and
 * recipient names were cut ("Jordan Hal…", "Tom Ellis, r…"), and at 1024 the
 * letter and recipient names shrank to one or two letters while the health
 * score ran into the Updated column (LISTS-X22, N1, X26). So instead:
 *
 *   1. Each column gets what its main line needs: the letter's name, the
 *      recipient's name, the matter's name, the where line, the date. A
 *      single very long value is capped so it cannot crowd the rest out; it
 *      ends in an ellipsis with the full text on hover.
 *   2. When those do not fit, the table makes room in this order: the health
 *      score drops "/ 100", the owner column keeps only its menu, then the
 *      Matter column goes and its matter leads the letter's sub line (so it
 *      is still in the row, R1-LETTERS-MATTER-COLUMN-DROPPED), then the
 *      recipient moves into the letter's sub line too, then Updated goes.
 *      Every row keeps one line per cell, so all rows are the same height.
 *   3. Room left over is shared between the letter's sub line and the
 *      recipient's job title so that as few of them as possible are cut,
 *      with the letter's own line counting double (short lines like
 *      "Conduct · 1 check to fix" are shown in full before a long one like
 *      "Conduct · PDF · reviewed by Alex Morgan"). What is
 *      still too long ends in an ellipsis, as in the mock, with the full
 *      text on hover.
 *
 * Pure: the caller measures text (canvas in the browser, an estimate in
 * tests) and the table width.
 */

export type LetterColumn = "select" | "recipient" | "matter" | "where" | "health" | "updated" | "owner";
export type TableColumn = LetterColumn | "letter";

/** The text styles the cells use, for measuring. */
export type TextStyle = "name" | "body" | "small" | "matter" | "where" | "date";

export const TEXT_FONT: Record<TextStyle, string> = {
  name: "500 14px",
  body: "400 14px",
  small: "400 12.5px",
  matter: "400 13.5px",
  where: "500 12.5px",
  date: "400 13.5px",
};

export type LayoutRow = {
  label: string;
  subLine: string;
  recipient: string | null;
  recipientRole?: string;
  matter?: string;
  where: string;
  date: string;
};

export type Measure = (text: string, style: TextStyle) => number;

export type TableLayout = {
  /** The columns shown, in order. */
  columns: TableColumn[];
  /** Width in px for every shown column but the letter column, which takes the rest. */
  widths: Partial<Record<TableColumn, number>>;
  /** The health cell shows the score without "/ 100". */
  healthCompact: boolean;
  /** The owner cell shows only the row menu. */
  ownerCompact: boolean;
  /** The recipient has no column of its own and leads the letter's sub line. */
  recipientInLetter: boolean;
  /** The matter has no column of its own and is in the letter's sub line. */
  matterInLetter: boolean;
};

/**
 * What a row's letter cell shows under its name: the recipient when it has
 * no column, then the matter when it has no column, then the usual line
 * ("Jordan Hale · Jordan Hale, attendance · Conduct · 1 check to fix").
 * `matter` is set when the line holds the matter, so the cell can mark it
 * with the folder icon the Matter column uses.
 */
export function letterSubLine(
  r: { subLine: string; recipient?: string | null; matter?: string | null },
  layout: Pick<TableLayout, "recipientInLetter" | "matterInLetter">
): { text: string; lead: string; matter?: string; rest: string } {
  const lead = layout.recipientInLetter && r.recipient ? r.recipient : "";
  const matter = layout.matterInLetter && r.matter ? r.matter : undefined;
  const text = [lead, matter, r.subLine].filter(Boolean).join(" · ");
  return { text, lead, matter, rest: r.subLine };
}

/** Cell padding, left and right (px-2.5). */
export const CELL_PAD = 20;
const SELECT_W = 40;
/** Paper icon (36 + 2) and the 12px gap before the name. */
const LETTER_CHROME = CELL_PAD + 38 + 12;
/** Avatar (28) and the 10px gap. */
const RECIPIENT_CHROME = CELL_PAD + 28 + 10;
/** Folder icon (14) and the 8px gap. */
const MATTER_CHROME = CELL_PAD + 14 + 8;
/** The smaller folder icon (12) and its 4px gap, in a letter's sub line. */
const SUB_MATTER_ICON = 16;
/** The four-segment stage bar is 118px wide. */
const STAGE_BAR_W = 118;
/** Ring, score and "/ 100"; compact drops "/ 100". */
const HEALTH_W = 106;
const HEALTH_COMPACT_W = 72;
/** Initials, the gap and the 28px menu button, with pl-2.5 and pr-1.5. */
const OWNER_W = 74;
const OWNER_COMPACT_W = 44;

/** Longest a column's main line may ask for before it ends in an ellipsis. */
const CAP: Record<"letter" | "recipient" | "matter" | "where" | "updated", number> = {
  letter: 250,
  recipient: 220,
  matter: 230,
  where: 220,
  updated: 120,
};
/** Longest a column may ask for to show its second line in full. */
const WANT_CAP = { recipient: 250 };

const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0);

type Plan = { drop: Set<LetterColumn>; healthCompact: boolean; ownerCompact: boolean; fold: boolean };

/** The ways of making room, best first. */
function plans(): Plan[] {
  const drops: { drop: LetterColumn[]; fold: boolean }[] = [
    { drop: [], fold: false },
    { drop: ["matter"], fold: false },
    { drop: ["matter", "recipient"], fold: true },
    { drop: ["matter", "recipient", "updated"], fold: true },
  ];
  const squeezes = [
    { healthCompact: false, ownerCompact: false },
    { healthCompact: true, ownerCompact: false },
    { healthCompact: true, ownerCompact: true },
  ];
  return drops.flatMap((d) => squeezes.map((s) => ({ drop: new Set(d.drop), fold: d.fold, ...s })));
}

export function letterTableLayout({
  width,
  columns,
  rows,
  measure,
}: {
  /** The table's width in px; 0 or less when not measured yet. */
  width: number;
  /** The columns asked for, in order (with "letter"). */
  columns: TableColumn[];
  rows: LayoutRow[];
  measure: Measure;
}): TableLayout {
  const has = (c: TableColumn) => columns.includes(c);
  const longest = (texts: (string | undefined | null)[], style: TextStyle) =>
    Math.ceil(max(texts.filter((t): t is string => !!t).map((t) => measure(t, style))));

  // What each column's main line needs, and what its second line would like.
  const need = {
    letter: Math.min(CAP.letter, LETTER_CHROME + longest(rows.map((r) => r.label), "name")),
    recipient: Math.min(
      CAP.recipient,
      Math.max(RECIPIENT_CHROME + longest(rows.map((r) => r.recipient), "body"), CELL_PAD + longest(["No recipient"], "matter"))
    ),
    matter: Math.min(CAP.matter, Math.max(MATTER_CHROME + longest(rows.map((r) => r.matter), "matter"), CELL_PAD + longest(["No matter"], "matter"))),
    where: Math.min(CAP.where, CELL_PAD + Math.max(STAGE_BAR_W, longest(rows.map((r) => r.where), "where"))),
    updated: Math.min(CAP.updated, CELL_PAD + Math.max(longest(rows.map((r) => r.date), "date"), longest(["Updated"], "where"))),
  };
  const want = {
    recipient: Math.min(WANT_CAP.recipient, Math.max(need.recipient, RECIPIENT_CHROME + longest(rows.map((r) => r.recipientRole), "small"))),
  };

  const widthOf = (c: TableColumn, p: Plan): number => {
    switch (c) {
      case "select":
        return SELECT_W;
      case "letter":
        return need.letter;
      case "recipient":
        return need.recipient;
      case "matter":
        return need.matter;
      case "where":
        return need.where;
      case "health":
        return p.healthCompact ? HEALTH_COMPACT_W : HEALTH_W;
      case "updated":
        return need.updated;
      case "owner":
        return p.ownerCompact ? OWNER_COMPACT_W : OWNER_W;
    }
  };

  const all = plans();
  const fits = (p: Plan) => columns.filter((c) => c === "letter" || !p.drop.has(c)).reduce((s, c) => s + widthOf(c, p), 0) <= width;
  // Unknown width (first render, tests): every column, full size.
  const plan = width > 0 ? (all.find(fits) ?? all[all.length - 1]) : all[0];
  // A table without a recipient column has nothing to fold.
  const fold = plan.fold && has("recipient");
  const shown = columns.filter((c) => c === "letter" || !plan.drop.has(c as LetterColumn));

  const widths: Partial<Record<TableColumn, number>> = {};
  for (const c of shown) if (c !== "letter") widths[c] = widthOf(c, plan);

  const matterIn = plan.drop.has("matter") && has("matter");

  // Room left over is shared between the letter's sub line (the letter
  // column has no set width and takes whatever the recipient does not) and
  // the recipient's job title, so the fewest lines are cut (R1-LETTERS-
  // MATTER-COLUMN-DROPPED: a fixed "job title first" order cut "Conduct ·
  // 1 check to fix" at 1440 to show one long job title).
  if (width > 0 && widths.recipient != null && want.recipient > need.recipient) {
    const spare = width - shown.reduce((s, c) => s + widthOf(c, plan), 0);
    if (spare > 0) {
      const layoutNow = { recipientInLetter: fold, matterInLetter: matterIn };
      const extras = (xs: number[]) => xs.map((x) => Math.ceil(x)).filter((x) => x > 0).sort((a, b) => a - b);
      const letterExtra = extras(
        rows.map((r) => {
          const sub = letterSubLine(r, layoutNow);
          return LETTER_CHROME + measure(sub.text, "small") + (sub.matter ? SUB_MATTER_ICON : 0) - need.letter;
        })
      );
      const roleCap = want.recipient - need.recipient;
      const roleExtra = extras(rows.map((r) => (r.recipientRole ? RECIPIENT_CHROME + measure(r.recipientRole, "small") - need.recipient : 0))).map((x) =>
        Math.min(x, roleCap)
      );
      // Two columns, so every split can be tried: the one that shows the most
      // lines in full wins, and whatever the recipient does not take goes to
      // the letter. A letter's sub line (its type and where it is) counts
      // twice a job title, so a status like "Absence · expert review" is not
      // cut to show a job title in full; on a tie the letter gets the room.
      const fixed = (xs: number[], at: number) => xs.filter((x) => x <= at).length;
      const score = (role: number) => fixed(roleExtra, role) + 2 * fixed(letterExtra, spare - role);
      let best = { role: 0, score: score(0) };
      for (const role of new Set(roleExtra)) {
        if (role > spare) break;
        const s = score(role);
        if (s > best.score) best = { role, score: s };
      }
      widths.recipient += best.role;
    }
  }

  return {
    columns: shown,
    widths,
    healthCompact: plan.healthCompact,
    ownerCompact: plan.ownerCompact,
    recipientInLetter: fold,
    matterInLetter: matterIn,
  };
}

/**
 * A text measurer. In the browser it sets the text in a hidden span inside
 * the table's own box, so the width includes the app's letter spacing and
 * font features (a canvas ignores those and came out a few px short, which
 * still cut "Jordan Hale, attendance"). Where nothing is laid out (tests,
 * or before the table has a width) it estimates from the character count.
 * Call `done` when finished to remove the span.
 */
export function makeMeasure(host: HTMLElement | null): { measure: Measure; done: () => void } {
  const cache = new Map<string, number>();
  let probe: HTMLSpanElement | null = null;
  const estimate = (text: string, style: TextStyle) => text.length * parseFloat(TEXT_FONT[style].split(" ")[1]) * 0.56;
  const measure: Measure = (text, style) => {
    const key = `${style}\u0000${text}`;
    const hit = cache.get(key);
    if (hit != null) return hit;
    let w = 0;
    if (host && host.clientWidth > 0) {
      if (!probe) {
        probe = document.createElement("span");
        probe.setAttribute("aria-hidden", "true");
        probe.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;";
        host.appendChild(probe);
      }
      const [weight, size] = TEXT_FONT[style].split(" ");
      probe.style.fontWeight = weight;
      probe.style.fontSize = size;
      probe.textContent = text;
      w = probe.getBoundingClientRect().width;
    }
    // jsdom lays nothing out (every width is 0): estimate instead.
    if (!(w > 0)) w = estimate(text, style);
    cache.set(key, w);
    return w;
  };
  return {
    measure,
    done: () => {
      probe?.remove();
      probe = null;
    },
  };
}
