import * as Environment from "~/node_common/environment";
import * as ScriptLogging from "~/node_common/script-logging";
import * as Data from "~/node_common/data";
import * as Serializers from "~/node_common/serializers";
import * as Websocket from "~/node_common/nodejs-websocket";
import * as Search from "~/node_common/search";

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import compression from "compression";
import MiniSearch from "minisearch";

const server = express();

//make it so can only access with a proper API key (JWT.verify)

const LENS = "SERVER START    ";

const _cache = {
  users: [],
  slates: [],
  miniSearch: null,
};

Search.initSearch();

Websocket.create();

server.use(bodyParser.json());
server.use(cors());
server.get("/favicon.ico", (req, res) => res.status(204));
server.get("/", async (req, res) => {
  ScriptLogging.message(LENS, "fetching serialized users and slates");

  if (!_cache.users.length) {
    ScriptLogging.message(LENS, "caching users ...");
    _cache.users = await Data.getEveryUser();
  }

  if (!_cache.slates.length) {
    ScriptLogging.message(LENS, "caching slates ...");
    _cache.slates = await Data.getEverySlate();
  }

  return res.status(200).json({
    decorator: "LENS",
    data: {
      users: Search.usersTrie,
      slates: Search.slatesTrie,
      files: Search.filesTrie,
      hashtable: Search.hashtable,
    },
  });
});

server.get("/:query", async (req, res) => {
  let searchResults = Search.search(req.params.query);
  return res.status(200).json({ decorator: "LENS", data: { results: searchResults } });
});

server.post("/search", async (req, res) => {
  let searchResults = Search.search(req.body.data.query, req.body.data.type);
  return res.status(200).json({ decorator: "LENS", data: { results: searchResults } });
});

server.listen(Environment.PORT, (e) => {
  if (e) throw e;

  ScriptLogging.log(LENS, `http://localhost:${Environment.PORT}`);
});
