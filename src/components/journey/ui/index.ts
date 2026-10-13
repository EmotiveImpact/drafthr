/**
 * Presentational parts of the letter journey, shared across screens (the
 * letter's Progress panel, the Letters list, Home, the review and send
 * flows). Foundation owns these; they take plain props and hold no data.
 */
export { StageTracker } from "./StageTracker";
export { StageBar } from "./StageBar";
export { StatusPill } from "./StatusPill";
export { NoticeStrip, NoticeChip, type NoticeTone } from "./NoticeStrip";
export { MarginCard, type MarginCardKind } from "./MarginCard";
export { HealthCard, type HealthFix } from "./HealthCard";
export { ActivityCard, type ActivityEvent } from "./ActivityCard";
export { Seal } from "./Seal";
export { PersonCard, type PersonTimelineItem } from "./PersonCard";
export { CheckRow, CheckList } from "./CheckRow";
export { WhatNow } from "./WhatNow";
