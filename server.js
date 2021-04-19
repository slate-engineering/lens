import * as Environment from "~/node_common/environment";
import * as ScriptLogging from "~/node_common/script-logging";
import * as Data from "~/node_common/data";
import * as Serializers from "~/node_common/serializers";
import * as Websocket from "~/node_common/nodejs-websocket";
import * as Search from "~/node_common/search-v4";

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

const server = express();

//make it so can only access with a proper API key (JWT.verify)

const LENS = "SERVER START    ";

Websocket.create();

server.use(bodyParser.json());
server.use(cors());
server.get("/favicon.ico", (req, res) => res.status(204));
server.get("/", async (req, res) => {
  ScriptLogging.message(LENS, "fetching serialized users and slates");

  return res.status(200).json({
    decorator: "LENS",
    data: "lens operational!",
  });
});

server.get("/:query", async (req, res) => {
  let searchResults = Search.search(req.params.query);
  return res.status(200).json({ decorator: "LENS", data: { results: searchResults } });
});

server.post("/search", async (req, res) => {
  let searchResults = await Search.search(req.body.data.query, req.body.data.type);
  return res.status(200).json({ decorator: "LENS", data: { results: searchResults } });
});

server.listen(Environment.PORT, (e) => {
  if (e) throw e;

  ScriptLogging.log(LENS, `http://localhost:${Environment.PORT}`);
});
