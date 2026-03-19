import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const celebrityInfo: Record<string, string> = {
  "taylor swift": "Taylor Swift is an American singer and songwriter.",
  "elon musk": "Elon Musk is a businessman known for Tesla and SpaceX.",
  "barack obama": "Barack Obama is a former president of the United States.",
  "beyonce": "Beyonce is an American singer and actress.",
  "lady gaga": "Lady Gaga is an American singer, songwriter, and actress.",
};

const azureCredentials = {
  endpoint: "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://lab5123.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "appointment",
  projectName: "lab5",
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials /** global activation of NLU */,
  azureCredentials: azureCredentials,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },

  actions: {
    /** define your actions here */
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.ssRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      }),
    "spst.listen": ({ context }) =>
      context.ssRef.send({
        type: "LISTEN",
        value: { nlu: true } /** Local activation of NLU */,
      }),
    resetContext: assign({
      person: null,
      day: null,
      time: null,
      allDay: null,
      lastResult: null,
      interpretation: null,
      wikiInfo: null,
    }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    ssRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    person: null,
    day: null,
    time: null,
    allDay: null,
    wikiInfo: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.ssRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    
    WaitToStart: {
      on: { CLICK: "Start" },
    },
    
    Start: {
      entry: { type: "spst.speak", params: { utterance: "Hello! I can help you create a meeting or tell you about someone" } },
      on: { SPEAK_COMPLETE: "AskIntent" },
    },
    
    AskIntent: {
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            interpretation: (event as any).nluValue,
          })),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
          target: ".Prompt", 
        },
      },

      initial: "Prompt",
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: "What would you like to do?" } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            LISTEN_COMPLETE: [
              {
                guard: ({ context }) =>
                  context.interpretation?.topIntent === "CreateMeeting",
                target: "#DM.AskPerson",
              },
              {
                guard: ({ context }) =>
                  context.interpretation?.topIntent === "WhoisX",
                target: "#DM.WhoisX",
              },
              { target: "NoMatch" },
            ],
          },
        },
        NoMatch: {
          entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand. Please say create a meeting or who is someone." } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
      },
    },

    WhoisX: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => {
          const rawName =
            context.interpretation?.entities?.find(
              (e: any) => e.category === "person_name"
            )?.text || "";

          const personName = rawName
            .toLowerCase()
            .replace(/'s$/i, "")
            .trim();

          if (!personName) {
            return { utterance: "I did not catch the person's name." };
          }

          const info = celebrityInfo[personName];

          if (info) {
            return { utterance: info };
          }

          return {
            utterance: `I know ${personName}, but I do not have more information right now.`,
          };
        },
      },
      on: { SPEAK_COMPLETE: "Done" },
    },

    AskPerson: {
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            interpretation: (event as any).nluValue,
          })),
        },
        ASR_NOINPUT: { actions: assign({ lastResult: null }), target: ".Listen" },
      },
      initial: "Prompt",
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: "Who are you meeting with?" } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            LISTEN_COMPLETE: [
              {
                guard: ({ context }) => !!context.lastResult?.[0]?.utterance,
                actions: assign(({ context }) => ({
                  person: context.interpretation?.entities?.find(
                   (e: any) => e.category === "person"
                  )?.text || context.lastResult![0].utterance
                })),
                target: "#DM.AskDay",
              },
              { target: "NoMatch" },
            ],
          },
        },
        NoMatch: {
          entry: { type: "spst.speak", params: { utterance: "I didn't catch that. Who are you meeting with?" } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
      },
    },

    AskDay: {
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            interpretation: (event as any).nluValue,
          })),
        },
        ASR_NOINPUT: { actions: assign({ lastResult: null }), target: ".Listen" },
      },
      initial: "Prompt",
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: "On which day is your meeting?" } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            LISTEN_COMPLETE: [
              {
                guard: ({ context }) => !!context.lastResult?.[0]?.utterance,
                actions: assign(({ context }) => ({
                  day: context.interpretation?.entities?.find(
                    (e: any) => e.category === "day"
                  )?.text || context.lastResult![0].utterance,
                })),
                target: "#DM.AskAllDay",
              },
              { target: "NoMatch" },
            ],
          },
        },
        NoMatch: {
          entry: { type: "spst.speak", params: { utterance: "I didn't catch that. What day?" } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
      },
    },

    AskAllDay: {
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            interpretation: (event as any).nluValue,
          })),
        },
        ASR_NOINPUT: { actions: assign({ lastResult: null }), target: ".Listen" },
      },
      initial: "Prompt",
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: "Will it take the whole day?" } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            LISTEN_COMPLETE: [
              {
                guard: ({ context }) => {
                  const yesNoEntity = context.interpretation?.entities?.find(
                    (e: any) => e.category === "yes_no"
                  )?.text?.toLowerCase();
                  
                  const utterance = context.lastResult?.[0]?.utterance?.toLowerCase();
                  return yesNoEntity === "yes" || (!!utterance&& ["yes", "yeah", "yep", "sure", "of course"].includes(utterance));                },
                  actions: assign({ allDay: true, time: null }),
                  target: "#DM.Confirm",
              },
              {
                guard: ({ context }) => {
                  const yesNoEntity = context.interpretation?.entities?.find(
                    (e: any) => e.category === "yes_no"
                  )?.text?.toLowerCase();
                  
                  const utterance = context.lastResult?.[0]?.utterance?.toLowerCase();
                  return yesNoEntity === "no" || utterance === "no";
                },
                actions: assign({ allDay: false }),
                target: "#DM.AskTime",
              },
              { target: "NoMatch" },
            ],
          },
        },
        NoMatch: {
          entry: { type: "spst.speak", params: { utterance: "Please answer yes or no." } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
      },
    },

    AskTime: {
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            interpretation: (event as any).nluValue,
          })),
        },
        ASR_NOINPUT: { actions: assign({ lastResult: null }), target: ".Listen" },
      },
      initial: "Prompt",
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: "What time is your meeting?" } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            LISTEN_COMPLETE: [
              {
                guard: ({ context }) => !!context.lastResult?.[0]?.utterance,
                actions: assign(({ context }) => ({
                  time: context.interpretation?.entities?.find(
                    (e: any) => e.category === "time"
                  )?.text || context.lastResult![0].utterance,
                })),
                target: "#DM.Confirm",
              },
              { target: "NoMatch" },
            ],
          },
        },
        NoMatch: {
          entry: { type: "spst.speak", params: { utterance: "I didn't catch the time." } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
      },
    },

    Confirm: {
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            interpretation: (event as any).nluValue,
          })),
        },
        ASR_NOINPUT: { actions: assign({ lastResult: null }), target: ".Listen" },
      },  
      initial: "Speak",
      states: {
        Speak: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => {
              const name = context.person ?? "someone";
              const day = context.day ?? "some day";
              if (context.allDay) {
                return { utterance: `Do you want me to create an appointment with ${name} on ${day} for the whole day?` };
              }
              const time = context.time ?? "some time";
              return { utterance: `Do you want me to create an appointment with ${name} on ${day} at ${time}?` };
            },
          },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            LISTEN_COMPLETE: [
              {
                guard: ({ context }) => {
                  const yesNoEntity = context.interpretation?.entities?.find(
                    (e: any) => e.category === "yes_no"
                  )?.text?.toLowerCase();
                  
                  const u = context.lastResult?.[0]?.utterance?.toLowerCase() || "";
                  
                  return yesNoEntity === "yes" || (["yes", "yeah", "yep", "sure", "of course"].includes(u));
                },
                target: "#DM.Created", 
              },
              {
                guard: ({ context }) => {
                  const yesNoEntity = context.interpretation?.entities?.find(
                    (e: any) => e.category === "yes_no"
                  )?.text?.toLowerCase();
                  
                  const u = context.lastResult?.[0]?.utterance?.toLowerCase() || "";
                  
                  return yesNoEntity === "no" || (["no", "nope", "nah"].includes(u));
                },
                actions: { type: "resetContext" },
                target: "#DM.AskIntent",
              },
              { target: "NoMatch" },
            ],
          },
        },
        NoMatch: {
          entry: { type: "spst.speak", params: { utterance: "Please answer yes or no." } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
      },
    },

    Created: {
      entry: { type: "spst.speak", params: { utterance: "Your appointment has been created!" } },
      on: { SPEAK_COMPLETE: "Done" },
    },

    Done: {
      on: { CLICK: "Start" },
    },
  },
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.ssRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}
