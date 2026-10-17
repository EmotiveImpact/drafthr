import { disciplinaryStories } from "./disciplinary.js";
import { grievanceStories } from "./grievance.js";
import { redundancyStories } from "./redundancy.js";
import type { StoryFixture } from "./types.js";

export const STORIES: StoryFixture[] = [...disciplinaryStories, ...grievanceStories, ...redundancyStories];
