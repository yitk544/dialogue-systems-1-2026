import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;
}

person: string | null;   // who are you meeting with
day: string | null;      // which day
time: string | null;     // what time (null if all-day)
allDay: boolean | null;  // will it take the whole day
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };
