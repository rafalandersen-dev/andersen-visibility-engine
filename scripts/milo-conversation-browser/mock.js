export const listMiloConversationsFn = ({ data }) => window.h.list(data);
export const readMiloConversationFn = ({ data }) => window.h.read(data);
export const sendMiloMessageFn = ({ data }) => window.h.send(data);
export const resumeMiloTurnFn = ({ data }) => window.h.resume(data);
export const cancelMiloTurnFn = ({ data }) => window.h.cancel(data);
