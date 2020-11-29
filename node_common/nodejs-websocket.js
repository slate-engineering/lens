import * as Environment from "~/node_common/environment";
import * as ScriptLogging from "~/node_common/script-logging";
import * as Strings from "~/common/strings";
import * as Search from "~/node_common/search";

import WebSocket from "ws";

let ws;

export const create = () => {
  if (ws) {
    return;
  }

  if (Strings.isEmpty(Environment.RESOURCE_URI_PUBSUB)) {
    return;
  }

  ws = new WebSocket(Environment.RESOURCE_URI_PUBSUB, {
    perMessageDeflate: false,
  });

  // ws.on("ping", () => {
  //   clearTimeout(pingTimeout);
  //   console.log("websocket ping");

  //   pingTimeout = setTimeout(() => {
  //     terminate(); //may need to remove this? not sure
  //   }, 30000 + 1000);
  // });

  ws.on("open", () => {
    console.log("WEBSOCKET OPENED");
    ws.send(JSON.stringify({ type: "LENS_SUBSCRIBE_HOST", data: {} }));
  });

  ws.on("message", (event) => {
    if (!ws || !event) {
      return;
    }

    let type;
    let data;
    try {
      const response = JSON.parse(event);
      type = response.type;
      data = response.data;
    } catch (e) {
      console.log(e);
    }

    if (!data || !type) {
      return;
    }

    if (type === "UPDATE") {
      console.log("UPDATE");
      Search.updateTrie(data.data);
    }
  });

  ws.on("close", () => {
    console.log("WEBSOCKET DISCONNECTED");
  });

  return ws;
};

export const get = () => ws;
