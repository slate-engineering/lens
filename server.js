import * as Environment from "~/node_common/environment";
import * as ScriptLogging from "~/node_common/script-logging";
import * as Data from "~/node_common/data";

import express from "express";
import cors from "cors";
import compression from "compression";

const server = express();

const LENS = "SERVER START    ";

const _cache = {
  users: [],
  slates: [],
};

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

  return res
    .status(200)
    .json({ decorator: "LENS", data: { users: _cache.users, slates: _cache.slates } });
});

const listenServer = server.listen(Environment.PORT, (e) => {
  if (e) throw e;

  ScriptLogging.log(LENS, `http://localhost:${Environment.PORT}`);
});
