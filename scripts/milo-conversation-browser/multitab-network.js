const call =
  (name) =>
  async ({ data }) => {
    const response = await fetch(`/api/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw Error("Fixture conversation request unavailable.");
    return response.json();
  };
export const sendMiloMessageFn = call("send");
export const readMiloConversationFn = call("read");
export const listMiloConversationsFn = call("list");
export const resumeMiloTurnFn = call("resume");
export const cancelMiloTurnFn = call("cancel");
