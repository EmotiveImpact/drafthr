import { disciplinaryStories } from "./disciplinary";
import { grievanceStories } from "./grievance";
import { redundancyStories } from "./redundancy";
import type { StoryFixture } from "./types";

export const STORIES: StoryFixture[] = [...disciplinaryStories, ...grievanceStories, ...redundancyStories];
