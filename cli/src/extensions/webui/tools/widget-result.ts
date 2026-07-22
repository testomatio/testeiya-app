/**
 * Tool result split for UI-rendering tools: `content` carries a short ack —
 * the only part the model ever sees in context — while `details.widget`
 * carries the full card payload. The WS bridge forwards `details.widget` to
 * the chat UI, so rendered data costs the model ~20 tokens instead of the
 * whole payload echoed back.
 */
export function widgetResult(ack: string, widget: unknown) {
  return {
    content: [{ type: "text" as const, text: ack }],
    details: { widget },
  };
}
