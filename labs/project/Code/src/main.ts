import "./style.css";
import { setupButton, dmActor } from "./dm.ts";
setupButton(document.querySelector<HTMLButtonElement>("#counter")!);


dmActor.subscribe((state) => {
  const crowbar = document.getElementById("item-crowbar");
  const key = document.getElementById("item-key");
  const ending = document.getElementById("ending");

  if (crowbar) {
    crowbar.className = "item" + (state.context.hasCrowbar ? " got" : "");
  }

  if (key) {
    key.className = "item" + (state.context.hasKey ? " got" : "");
  }

  if (ending) {
    if (state.value === "Win" || state.value === "DoneWin") {
      ending.textContent =
        "You keep perfectly still. The guard walks away. You slip through the exit and escape.";
    } else if (state.value === "Basement_Caught_Speak" || state.value === "DoneLose") {
      ending.textContent =
        "A sound escapes you. The guard hears you and catches you.";
    } else {
      ending.textContent = "";
    }
  }
});