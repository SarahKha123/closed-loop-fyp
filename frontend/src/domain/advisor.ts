// What the Advisor says without a model: canned explanations for flagged
// components, the opening messages, and the system prompt sent with every
// chat so the model knows the current readings.

import { TOTAL_CYCLES } from "./demo-data"
import type { ChatMessage, Cycle } from "./types"

const explanationTemplates: Record<string, (value: string, woId: string) => string> = {
  Accumulator: (value, woId) =>
    `Gas pre-charge pressure is reading ${value}, below the 100 bar threshold used in training — consistent with early accumulator wear. ${woId} has been routed to the maintenance queue.`,
  Valve: (value, woId) =>
    `Switching response has drifted to ${value}, below the 95% baseline used in training — consistent with solenoid wear. ${woId} has been routed to the maintenance queue.`,
  Cooler: (value, woId) =>
    `Cooling efficiency has dropped to ${value}, below the 90% baseline used in training — consistent with a partially blocked heat exchanger. ${woId} has been routed to the maintenance queue.`,
  Pump: (value, woId) =>
    `Internal leakage has been detected (${value}), consistent with worn piston seals. ${woId} has been routed to the maintenance queue.`,
}

export function explanationFor(componentName: string, value: string, woId: string): string {
  const template = explanationTemplates[componentName]
  if (template) return template(value, woId)
  return `${componentName} is reading ${value}, outside the trained baseline. ${woId} has been routed to the maintenance queue.`
}

/** The Advisor's opening messages for a cycle: what the batch run found. */
export function welcomeMessages(cycle: Cycle): ChatMessage[] {
  const flaggedCount = cycle.components.filter((c) => c.kind !== "good").length
  const messages: ChatMessage[] = [
    {
      role: "assistant",
      text: `Latest batch processed — cycle ${cycle.id.toLocaleString()} of ${TOTAL_CYCLES.toLocaleString()}. ${
        flaggedCount ? `${flaggedCount} component${flaggedCount > 1 ? "s" : ""} flagged for review.` : "All components normal."
      }`,
    },
  ]
  if (cycle.newWorkOrder) {
    messages.push({
      role: "assistant",
      text: `Work order ${cycle.newWorkOrder.id} was opened automatically for the ${cycle.newWorkOrder.component.toLowerCase()}.`,
    })
  }
  return messages
}

/** The system prompt that grounds a chat in the selected cycle's readings. */
export function buildSystemPrompt(cycle: Cycle): string {
  return [
    "You are the Advisor panel embedded in Closed Loop, a predictive-maintenance dashboard for a hydraulic test rig (UCI hydraulic condition monitoring dataset).",
    `Current batch cycle: ${cycle.id.toLocaleString()}.`,
    `Component readings: ${cycle.components.map((c) => `${c.name} — ${c.value} (${c.statusLabel})`).join("; ")}.`,
    cycle.flaggedComponent ? `Flagged component: ${cycle.flaggedComponent}.` : "No component is currently flagged.",
    "Answer briefly and concretely, in the voice of a maintenance engineer's assistant.",
  ].join(" ")
}
