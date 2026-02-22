import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
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
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  yes?: true;
  no?: true;
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  nancy: { person: "Yitong Lou" },

  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },
  today: { day: "Today" },
  tomorrow: { day: "Tomorrow" },

  "1": { time: "01:00" },
  "2": { time: "2:00" },
  "3": { time: "3:00" },
  "4": { time: "4:00" },
  "5": { time: "5:00" },
  "6": { time: "6:00" },
  "7": { time: "7:00" },
  "8": { time: "8:00" },
  "9": { time: "9:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },

  yes: { yes: true },
  yeah: { yes: true },
  yep: { yes: true },
  "of course": { yes: true },
  sure: { yes: true },
  ok: { yes: true },
  okay: { yes: true },

  no: { no: true },
  nope: { no: true },
  nah: { no: true },
  "no way": { no: true },
};

function isInGrammar(utterance: string) {
  return norm(utterance)  in grammar;
}

function getPerson(utterance: string) {
  return (entry(utterance) || {}).person;
}

function norm(utterance: string) {
  return utterance.trim().toLowerCase();
}

function entry(utterance: string) {
  return grammar[norm(utterance)];
}

function getDay(utterance: string) {
  return (entry(utterance) || {}).day;
}

function getTime(utterance: string) {
  return (entry(utterance) || {}).time;
}

function isYes(utterance: string) {
  return !!(entry(utterance) || {}).yes;
}

function isNo(utterance: string) {
  return !!(entry(utterance) || {}).no;
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
      }),
      
      resetAppointment: assign({
        person: null,
        day: null,
        time: null,
        allDay: null,
        lastResult: null,
      }),
      
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    person: null,
    day: null,
    time: null,
    allDay: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Appointment" },
    },
    Appointment: {
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value
          })),
        },
    
        ASR_NOINPUT: {
          actions: assign({
            lastResult: null
          }),
        },
      },
      initial: "Start",
      states: {
        Start: {
          entry: { type: "spst.speak", params: { utterance: "Let's create an appointment." } },
          on: { SPEAK_COMPLETE: "AskPerson.Prompt" },
        },
    
        AskPerson: {
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
                    guard: ({ context }) =>
                      !!context.lastResult && !!getPerson(context.lastResult[0].utterance),
                    actions: assign(({ context }) => ({
                      person: getPerson(context.lastResult![0].utterance) || null,
                      lastResult: null,
                    })),
                    target: "#DM.Appointment.AskDay.Prompt",
                  },
                  { target: "NoMatch" },
                ],
              },
            },
            NoMatch: {
              entry: { type: "spst.speak", params: { utterance: "I didn't get the name. Please say a name in the grammar." } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
          },
        },
    
        AskDay: {
          id: "AskDay",
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
                    guard: ({ context }) =>
                      !!context.lastResult && !!getDay(context.lastResult[0].utterance),
                    actions: assign(({ context }) => ({
                      day: getDay(context.lastResult![0].utterance) || null,
                      lastResult: null,
                    })),
                    target: "#DM.Appointment.AskAllDay.Prompt",
                  },
                  { target: "NoMatch" },
                ],
              },
            },
            NoMatch: {
              entry: { type: "spst.speak", params: { utterance: "I didn't get the day." } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
          },
        },
    
        AskAllDay: {
          id: "AskAllDay",
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
                    guard: ({ context }) =>
                      !!context.lastResult && isYes(context.lastResult[0].utterance),
                    actions: assign({ allDay: true, time: null, lastResult: null }),
                    target: "#DM.Appointment.Confirm",
                  },
                  {
                    guard: ({ context }) =>
                      !!context.lastResult && isNo(context.lastResult[0].utterance),
                    actions: assign({ allDay: false, lastResult: null }),
                    target: "#DM.Appointment.AskTime.Prompt",
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
          id: "AskTime",
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
                    guard: ({ context }) =>
                      !!context.lastResult && !!getTime(context.lastResult[0].utterance),
                    actions: assign(({ context }) => ({
                      time: getTime(context.lastResult![0].utterance) || null,
                      lastResult: null,
                    })),
                    target: "#DM.Appointment.Confirm",
                  },
                  { target: "NoMatch" },
                ],
              },
            },
            NoMatch: {
              entry: { type: "spst.speak", params: { utterance: "I didn't get the time. Please say 10 or 14:30." } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
          },
        },
    
        Confirm: {
          id: "Confirm",
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
          on: { SPEAK_COMPLETE: "ConfirmListen" },
        },
    
        ConfirmListen: {
          entry: { type: "spst.listen" },
          on: {
            LISTEN_COMPLETE: [
              {
                guard: ({ context }) =>
                  !!context.lastResult && isYes(context.lastResult[0].utterance),
                actions: assign({ lastResult: null }),
                target: "Created",
              },
              {
                guard: ({ context }) =>
                  !!context.lastResult && isNo(context.lastResult[0].utterance),
                actions: { type: "resetAppointment" },
                target: "AskPerson.Prompt",
              },
              { target: "ConfirmNoMatch" },
            ],
          },
        },
    
        ConfirmNoMatch: {
          entry: { type: "spst.speak", params: { utterance: "Please answer yes or no." } },
          on: { SPEAK_COMPLETE: "ConfirmListen" },
        },
    
        Created: {
          entry: { type: "spst.speak", params: { utterance: "Your appointment has been created!" } },
          on: { SPEAK_COMPLETE: "Done" },
        },
    
        Done: {
          on: { CLICK: "Start" },
        },
      },
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
      snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}
