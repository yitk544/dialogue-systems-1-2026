import { assign, createActor, setup } from "xstate";
import { speechstate } from "speechstate";
import type { Settings } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-JennyNeural",
};

function heard(keyword: string, utterance: string | undefined): boolean {
  return (utterance || "").toLowerCase().includes(keyword.toLowerCase());
}

function heardAny(keywords: string[], utterance: string | undefined): boolean {
  const u = (utterance || "").toLowerCase();
  return keywords.some((k) => u.includes(k.toLowerCase()));
}

const NORTH = ["north", "nories", "nory", "norris", "norse", "forth", "force", "fourth"];
const SOUTH = ["south", "mouth", "sowth", "sow", "sal", "doubt"];
const EAST  = ["east", "feast", "least", "beast", "yeast", "ease"];
const WEST  = ["west", "vest", "best", "rest", "quest", "blessed"];
const TAKE  = ["take", "tape", "like", "lake", "cake", "make", "fake", "rake", "bake", "wake", "steak"];
const GRAB  = ["grab", "graph", "crab", "grabs", "grabbed"];
const USE   = ["use", "used", "using", "views", "hugh", "juice", "loose","youth"];
const ENTER = ["enter", "entrance", "entered", "inter", "center", "central"];
const OPEN  = ["open", "opening", "opened", "hope", "spoken", "token", "broken"];

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.ssRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      }),
    "spst.listen": ({ context }) =>
      context.ssRef.send({
        type: "LISTEN",
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    ssRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    hasCrowbar: false,
    hasKey: false,
  }),
  id: "VoiceEscape",
  initial: "Prepare",

  states: {

    Prepare: {
      entry: ({ context }) => context.ssRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Intro" },
    },

    Intro: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "You wake up in a locked building. Find a way out. " +
            "Say north, south, east, or west to move between rooms.",
        },
      },
      on: { SPEAK_COMPLETE: "Hallway" },
    },

    // ══════════════════════════════════════════════════════
    //  BUFFER STATES — 300ms pause lets ASR pipeline close
    //  before the next room's TTS fires
    // ══════════════════════════════════════════════════════
    GoLibrary:             { after: { 800: "Library" } },
    GoStorage:             { after: { 800: "Storage" } },
    GoKitchen:             { after: { 800: "Kitchen" } },
    GoBasement:            { after: { 800: "Basement" } },
    GoHallwayFromLibrary:  { after: { 800: "Hallway" } },
    GoHallwayFromStorage:  { after: { 800: "Hallway" } },
    GoHallwayFromKitchen:  { after: { 800: "Hallway" } },
    GoLibraryFromBasement: { after: { 800: "Library" } },

    // ══════════════════════════════════════════════════════
    //  HALLWAY
    // ══════════════════════════════════════════════════════
    Hallway: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "Entrance hallway. " +
            "North is the library. East is the storage room. West is the kitchen. " +
            "Where do you go?",
        },
      },
      on: { SPEAK_COMPLETE: "Hallway_Listen" },
    },
    Hallway_Listen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          { guard: ({ event }) => heardAny(NORTH, event.value?.[0]?.utterance), target: "GoLibrary",    actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(EAST,  event.value?.[0]?.utterance), target: "GoStorage",    actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(WEST,  event.value?.[0]?.utterance), target: "GoKitchen",    actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(SOUTH, event.value?.[0]?.utterance), target: "Hallway_Wall", actions: assign({ lastResult: ({ event }) => event.value }) },
          { target: "Hallway_NoMatch" },
        ],
        ASR_NOINPUT: "Hallway_NoMatch",
      },
    },
    Hallway_NoMatch:          { after: { 800: "Hallway_NoMatch_Speak" } },
    Hallway_NoMatch_Speak: {
      entry: { type: "spst.speak", params: { utterance: "I didn't catch that. Say north for library, east for storage, or west for kitchen." } },
      on: { SPEAK_COMPLETE: "Hallway_Listen" },
    },
    Hallway_Wall:          { after: { 800: "Hallway_Wall_Speak" } },
    Hallway_Wall_Speak: {
      entry: { type: "spst.speak", params: { utterance: "There is a wall there. You cannot go that way." } },
      on: { SPEAK_COMPLETE: "Hallway_Listen" },
    },

    // ══════════════════════════════════════════════════════
    //  LIBRARY
    // ══════════════════════════════════════════════════════
    Library: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "The library. Dusty bookshelves everywhere. " +
            "There is a small safe with a number pad in the corner. " +
            "Say the four digit code to try the safe, or south to go back.",
        },
      },
      on: { SPEAK_COMPLETE: "Library_Listen" },
    },
    Library_Listen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          { guard: ({ event }) => heard("1234",  event.value?.[0]?.utterance), target: "Library_SafeOpen",      actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(SOUTH, event.value?.[0]?.utterance), target: "GoHallwayFromLibrary", actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(NORTH, event.value?.[0]?.utterance), target: "Library_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(EAST,  event.value?.[0]?.utterance), target: "Library_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(WEST,  event.value?.[0]?.utterance), target: "Library_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { target: "Library_NoMatch" },
        ],
        ASR_NOINPUT: "Library_NoMatch",
      },
    },
    Library_NoMatch:          { after: { 800: "Library_NoMatch_Speak" } },
    Library_NoMatch_Speak: {
      entry: { type: "spst.speak", params: { utterance: "I didn't catch that. Say the four digit code to open the safe, or south to return to the hallway." } },
      on: { SPEAK_COMPLETE: "Library_Listen" },
    },
    Library_Wall:          { after: { 800: "Library_Wall_Speak" } },
    Library_Wall_Speak: {
      entry: { type: "spst.speak", params: { utterance: "There is a wall there. You cannot go that way." } },
      on: { SPEAK_COMPLETE: "Library_Listen" },
    },
    Library_SafeOpen:          { after: { 800: "Library_SafeOpen_Speak" } },
    Library_SafeOpen_Speak: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "The safe clicks open. Inside is a note: the basement is behind a hidden trapdoor in this library. " +
            "It says only the iron key can unlock it. " +
            "Say enter to open the trapdoor, or south to go back.",
        },
      },
      on: { SPEAK_COMPLETE: "Library_AfterSafe" },
    },
    Library_AfterSafe: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          {
            guard: ({ context, event }) =>
              context.hasKey && heardAny(ENTER, event.value?.[0]?.utterance),
            target: "GoBasement",
            actions: assign({ lastResult: ({ event }) => event.value }),
          },
          {
            guard: ({ event }) => heardAny(ENTER, event.value?.[0]?.utterance),
            target: "Library_AfterSafe_NoKey",
            actions: assign({ lastResult: ({ event }) => event.value }),
          },
          { guard: ({ event }) => heardAny(SOUTH, event.value?.[0]?.utterance), target: "GoHallwayFromLibrary", actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(NORTH, event.value?.[0]?.utterance), target: "Library_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(EAST,  event.value?.[0]?.utterance), target: "Library_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(WEST,  event.value?.[0]?.utterance), target: "Library_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { target: "Library_AfterSafe_NoMatch" },
        ],
        ASR_NOINPUT: "Library_AfterSafe_NoMatch",
      },
    },
    Library_AfterSafe_NoKey:          { after: { 800: "Library_AfterSafe_NoKey_Speak" } },
    Library_AfterSafe_NoKey_Speak: {
      entry: { type: "spst.speak", params: { utterance: "The trapdoor is locked. You need the iron key first." } },
      on: { SPEAK_COMPLETE: "Library_AfterSafe" },
    },
    Library_AfterSafe_NoMatch:          { after: { 800: "Library_AfterSafe_NoMatch_Speak" } },
    Library_AfterSafe_NoMatch_Speak: {
      entry: { type: "spst.speak", params: { utterance: "I didn't catch that. Say enter to open the trapdoor, or south to return to the hallway." } },
      on: { SPEAK_COMPLETE: "Library_AfterSafe" },
    },

    // ══════════════════════════════════════════════════════
    //  STORAGE
    // ══════════════════════════════════════════════════════
    Storage: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "The storage room. Dusty boxes on every shelf. " +
            "You spot a crowbar leaning against the wall, " +
            "and a scrap of paper with the number 1-2-3-4 written on it. " +
            "Say take to get the crowbar, or west to go back.",
        },
      },
      on: { SPEAK_COMPLETE: "Storage_Listen" },
    },
    Storage_Listen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          {
            guard: ({ context, event }) =>
              !context.hasCrowbar &&
              (heardAny(TAKE, event.value?.[0]?.utterance) ||
                heardAny(GRAB, event.value?.[0]?.utterance)),
            target: "Storage_TookCrowbar",
            actions: assign({ lastResult: ({ event }) => event.value, hasCrowbar: true }),
          },
          {
            guard: ({ event }) =>
              heardAny(TAKE, event.value?.[0]?.utterance) ||
              heardAny(GRAB, event.value?.[0]?.utterance),
            target: "Storage_AlreadyHasCrowbar",
            actions: assign({ lastResult: ({ event }) => event.value }),
          },
          { guard: ({ event }) => heardAny(WEST,  event.value?.[0]?.utterance), target: "GoHallwayFromStorage", actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(NORTH, event.value?.[0]?.utterance), target: "Storage_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(SOUTH, event.value?.[0]?.utterance), target: "Storage_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(EAST,  event.value?.[0]?.utterance), target: "Storage_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { target: "Storage_NoMatch" },
        ],
        ASR_NOINPUT: "Storage_NoMatch",
      },
    },
    Storage_NoMatch:          { after: { 800: "Storage_NoMatch_Speak" } },
    Storage_NoMatch_Speak: {
      entry: { type: "spst.speak", params: { utterance: "I didn't catch that. Say take to pick up the crowbar, or west to return to the hallway." } },
      on: { SPEAK_COMPLETE: "Storage_Listen" },
    },
    Storage_Wall:          { after: { 800: "Storage_Wall_Speak" } },
    Storage_Wall_Speak: {
      entry: { type: "spst.speak", params: { utterance: "There is a wall there. You cannot go that way." } },
      on: { SPEAK_COMPLETE: "Storage_Listen" },
    },
    Storage_TookCrowbar:          { after: { 800: "Storage_TookCrowbar_Speak" } },
    Storage_TookCrowbar_Speak: {
      entry: { type: "spst.speak", params: { utterance: "You grab the crowbar. Say west to go back." } },
      on: { SPEAK_COMPLETE: "Storage_AfterTake" },
    },
    Storage_AlreadyHasCrowbar:          { after: { 800: "Storage_AlreadyHasCrowbar_Speak" } },
    Storage_AlreadyHasCrowbar_Speak: {
      entry: { type: "spst.speak", params: { utterance: "You already have the crowbar. Say west to go back." } },
      on: { SPEAK_COMPLETE: "Storage_Listen" },
    },
    Storage_AfterTake: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          { guard: ({ event }) => heardAny(WEST,  event.value?.[0]?.utterance), target: "GoHallwayFromStorage", actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(NORTH, event.value?.[0]?.utterance), target: "Storage_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(SOUTH, event.value?.[0]?.utterance), target: "Storage_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(EAST,  event.value?.[0]?.utterance), target: "Storage_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { target: "Storage_AfterTake_NoMatch" },
        ],
        ASR_NOINPUT: "Storage_AfterTake_NoMatch",
      },
    },
    Storage_AfterTake_NoMatch:          { after: { 800: "Storage_AfterTake_NoMatch_Speak" } },
    Storage_AfterTake_NoMatch_Speak: {
      entry: { type: "spst.speak", params: { utterance: "I didn't catch that. Say west to return to the hallway." } },
      on: { SPEAK_COMPLETE: "Storage_AfterTake" },
    },

    // ══════════════════════════════════════════════════════
    //  KITCHEN
    // ══════════════════════════════════════════════════════
    Kitchen: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "The kitchen. Cold and dark. " +
            "A locked drawer under the counter — you can see a key inside through the gap. " +
            "Say use to open the drawer with the crowbar, or east to go back.",
        },
      },
      on: { SPEAK_COMPLETE: "Kitchen_Listen" },
    },
    Kitchen_Listen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          {
            guard: ({ context, event }) =>
              context.hasCrowbar && !context.hasKey && heardAny(USE, event.value?.[0]?.utterance),
            target: "Kitchen_GotKey",
            actions: assign({ lastResult: ({ event }) => event.value, hasKey: true }),
          },
          {
            guard: ({ context, event }) =>
              context.hasKey && heardAny(USE, event.value?.[0]?.utterance),
            target: "Kitchen_AlreadyHasKey",
            actions: assign({ lastResult: ({ event }) => event.value }),
          },
          {
            guard: ({ event }) => heardAny(USE, event.value?.[0]?.utterance),
            target: "Kitchen_NoCrowbar",
            actions: assign({ lastResult: ({ event }) => event.value }),
          },
          { guard: ({ event }) => heardAny(EAST,  event.value?.[0]?.utterance), target: "GoHallwayFromKitchen", actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(NORTH, event.value?.[0]?.utterance), target: "Kitchen_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(SOUTH, event.value?.[0]?.utterance), target: "Kitchen_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(WEST,  event.value?.[0]?.utterance), target: "Kitchen_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { target: "Kitchen_NoMatch" },
        ],
        ASR_NOINPUT: "Kitchen_NoMatch",
      },
    },
    Kitchen_NoMatch:          { after: { 800: "Kitchen_NoMatch_Speak" } },
    Kitchen_NoMatch_Speak: {
      entry: { type: "spst.speak", params: { utterance: "I didn't catch that. Say use to open the drawer, or east to return to the hallway." } },
      on: { SPEAK_COMPLETE: "Kitchen_Listen" },
    },
    Kitchen_Wall:          { after: { 800: "Kitchen_Wall_Speak" } },
    Kitchen_Wall_Speak: {
      entry: { type: "spst.speak", params: { utterance: "There is a wall there. You cannot go that way." } },
      on: { SPEAK_COMPLETE: "Kitchen_Listen" },
    },
    Kitchen_NoCrowbar:          { after: { 800: "Kitchen_NoCrowbar_Speak" } },
    Kitchen_NoCrowbar_Speak: {
      entry: { type: "spst.speak", params: { utterance: "The drawer won't budge. You need something to open it." } },
      on: { SPEAK_COMPLETE: "Kitchen_Listen" },
    },
    Kitchen_GotKey:          { after: { 800: "Kitchen_GotKey_Speak" } },
    Kitchen_GotKey_Speak: {
      entry: { type: "spst.speak", params: { utterance: "The crowbar cracks the drawer open. Inside — a heavy iron key. You pocket it. Say east to go back." } },
      on: { SPEAK_COMPLETE: "Kitchen_AfterKey" },
    },
    Kitchen_AlreadyHasKey:          { after: { 800: "Kitchen_AlreadyHasKey_Speak" } },
    Kitchen_AlreadyHasKey_Speak: {
      entry: { type: "spst.speak", params: { utterance: "The drawer is already open, and you already took the key. Say east to go back." } },
      on: { SPEAK_COMPLETE: "Kitchen_AfterKey" },
    },
    Kitchen_AfterKey: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          { guard: ({ event }) => heardAny(EAST,  event.value?.[0]?.utterance), target: "GoHallwayFromKitchen", actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(NORTH, event.value?.[0]?.utterance), target: "Kitchen_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(SOUTH, event.value?.[0]?.utterance), target: "Kitchen_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { guard: ({ event }) => heardAny(WEST,  event.value?.[0]?.utterance), target: "Kitchen_Wall",         actions: assign({ lastResult: ({ event }) => event.value }) },
          { target: "Kitchen_AfterKey_NoMatch" },
        ],
        ASR_NOINPUT: "Kitchen_AfterKey_NoMatch",
      },
    },
    Kitchen_AfterKey_NoMatch:          { after: { 800: "Kitchen_AfterKey_NoMatch_Speak" } },
    Kitchen_AfterKey_NoMatch_Speak: {
      entry: { type: "spst.speak", params: { utterance: "I didn't catch that. Say east to return to the hallway." } },
      on: { SPEAK_COMPLETE: "Kitchen_AfterKey" },
    },

    // ══════════════════════════════════════════════════════
    //  BASEMENT
    // ══════════════════════════════════════════════════════

    Basement: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "You pull open the trapdoor and drop into the basement below. " +
            "The exit door is right there — but a guard is standing just around the corner. " +
            "You can hear him breathing. Stay completely silent.",
        },
      },
      on: { SPEAK_COMPLETE: "Basement_Silence_Buffer" },
    },

    Basement_Silence_Buffer: {
      after: {
        500: "Basement_Silence",
      },
    },

    Basement_Silence: {
      entry: { type: "spst.listen" },
      after: {
        3000: "Win",
      },
      on: {
        RECOGNISED: "Basement_Caught",
        ASR_NOINPUT: "Win",
      },
    },

    Basement_Caught: {
      after: {
        500: "Basement_Caught_Speak",
      },
    },
    Basement_Caught_Speak: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "A sound escapes you. The guard spins around. " +
            "His torch beam finds your face. " +
            "You are caught. Click to try again.",
        },
      },
      on: { SPEAK_COMPLETE: "DoneLose" },
    },
    // ══════════════════════════════════════════════════════
    //  WIN
    // ══════════════════════════════════════════════════════

    Win: {
      after: {
        1500: "DoneWin",
      },
    },

    DoneWin: {
      on: {
        CLICK: {
          target: "Intro",
          actions: assign({ hasCrowbar: false, hasKey: false }),
        },
      },
    },

    DoneLose: {
      on: {
        CLICK: {
          target: "Intro",
          actions: assign({ hasCrowbar: false, hasKey: false }),
        },
      },
    },

      },
    });

    export const dmActor = createActor(dmMachine, {
      inspect: inspector.inspect,
    }).start();

    dmActor.subscribe((state) => {
      console.group("State update");
      console.log("State value:", state.value);
      console.log("hasCrowbar:", state.context.hasCrowbar);
      console.log("hasKey:", state.context.hasKey);
      console.groupEnd();
    });

    export function setupButton(element: HTMLButtonElement) {
      element.addEventListener("click", () => {
        dmActor.send({ type: "CLICK" });
      });

      dmActor.subscribe((snapshot) => {
        const meta: { view?: string } =
          Object.values(snapshot.context.ssRef.getSnapshot().getMeta())[0] || {
            view: undefined,
          };
        element.innerHTML = `${meta.view}`;
      });
    }
