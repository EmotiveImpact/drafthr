/**
 * review_links: one row per review a letter is sent out for (migration
 * 0022_trusted_review_links). Defined in src/db/schema.ts with the other
 * tables so drizzle-kit sees it; re-exported here for the review-links
 * handler and service.
 */
export { reviewLinks, type ReviewLinkRow, type NewReviewLinkRow } from "../../src/db/schema.js";
