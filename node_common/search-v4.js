import * as Data from "~/node_common/data";

import FlexSearch from "flexsearch";
import Redis from "ioredis";

let index;
let client = new Redis({
  port: process.env.REDIS_PORT,
  host: process.env.REDIS_HOST,
  password: process.env.REDIS_PASSWORD,
});

client.on("connect", function () {
  console.log("connected");
  client.flushall();
  initSearch();
});

client.on("error", function (error) {
  console.log(error);
});

//MIGRATION: shoulud use public only, and sanitize true for the get every...
//transfer those new functions over as well
//maybe delete all unused functions b/c they are old and won't work. don't wnat people using them incorrectly without realizing thtat
//pll should just copy it over and recreate it if they're going to use it
export const initSearch = async () => {
  index = new FlexSearch({
    doc: {
      id: "id",
      field: ["name", "title", "type"],
      store: ["id", "type"],
    },
  });
  let items = [];
  let slates = await Data.getEverySlate({ sanitize: true, publicOnly: true });
  for (let slate of slates) {
    items.push({ ...slate, type: "SLATE" });
  }
  let users = await Data.getEveryUser({ sanitize: true });
  for (let user of users) {
    items.push({ ...user, type: "USER" });
  }
  let files = await Data.getEveryFile({ sanitize: true, publicOnly: true });
  for (let file of files) {
    items.push({ ...file, type: "FILE" });
  }
  addItems(items);
};

export const search = async (query, type) => {
  let resultIds;
  if (type) {
    resultIds = index.search(query, {
      field: ["name", "title"],
      where: { type },
      limit: 100,
      suggest: true,
    });
  } else {
    resultIds = index.search(query, { field: ["name", "title"], limit: 100, suggest: true });
  }
  resultIds = resultIds.map((obj) => obj.id);
  let results = [];
  if (resultIds && resultIds.length) {
    results = await client.mget(...resultIds);
  }
  results = results.map((res) => JSON.parse(res));
  console.log(results);

  let ownerResults = [];
  if (!type || type === "SLATE" || type === "FILE") {
    let ownerIds = results
      .filter((item) => item?.type === "SLATE" || item?.type === "FILE")
      .map((item) => item.ownerId);
    if (ownerIds?.length) {
      ownerResults = await client.mget(...ownerIds);
      ownerResults = ownerResults.map((res) => JSON.parse(res));
    }
  }

  let usertable = {};
  for (let result of ownerResults) {
    usertable[result.id] = result;
  }

  let serialized = [];
  for (let item of results) {
    if (!item) continue;
    let ownerId, file, user, slate;
    if (item.type === "USER") {
      user = item;
      ownerId = item.id;
    } else if (item.type === "SLATE") {
      ownerId = item.ownerId;
      user = usertable[ownerId];
      slate = item;
    } else if (item.type === "FILE") {
      ownerId = item.ownerId;
      user = usertable[ownerId];
      file = item;
    }
    serialized.push({ type: item.type, file, user, slate, ownerId });
  }
  //NOTE(martina): surface the ownerId (for sorting / filtering) and serialize slates and files with their respective slates + owners
  return serialized;
};

export const updateIndex = (update) => {
  console.log(update.data);
  if (update.action === "ADD") {
    // console.log(update.data);
    console.log("ADD TO TRIE");
    if (Array.isArray(update.data)) {
      addItems(update.data);
    } else {
      addItem(update.data);
    }
  } else if (update.action === "REMOVE") {
    // console.log(update.data.id);
    console.log("REMOVE FROM TRIE");
    if (Array.isArray(update.data)) {
      removeItems(update.data);
    } else {
      removeItem(update.data);
    }
  } else if (update.action === "EDIT") {
    // console.log(update.data);
    console.log("EDIT TRIE");
    if (Array.isArray(update.data)) {
      editItems(update.data);
    } else {
      editItem(update.data);
    }
  }
};

const addItems = (items) => {
  if (!items?.length) return;
  let toAdd = {};
  for (let item of items) {
    if (!item) {
      continue;
    }
    let name;
    let title;
    if (item.type === "USER") {
      name = item.username;
      title = item.data.name;
    } else if (item.type === "SLATE") {
      name = item.slatename;
      title = item.data.name;
    } else if (item.type === "FILE") {
      name = item.filename;
      title = item.data.name;
    }
    let id = item.id;
    index.add({ name, title, type: item.type, id });
    toAdd[id] = JSON.stringify(item);
  }
  if (Object.keys(toAdd).length) {
    const pipeline = client.pipeline();
    pipeline.mset(toAdd);
    pipeline.exec((err, results) => {
      console.log("finished adding");
    });
  }
};

const addItem = (item) => {
  if (!item) return;
  let name;
  let title;
  if (item.type === "USER") {
    name = item.username;
    title = item.data.name;
  } else if (item.type === "SLATE") {
    name = item.slatename;
    title = item.data.name;
  } else if (item.type === "FILE") {
    name = item.filename;
    title = item.data.name;
  }
  let id = item.id;
  index.add({ name, title, type: item.type, id });
  client.set(id, JSON.stringify(item));
};

const removeItems = (items) => {
  if (!items?.length) return;
  for (let item of items) {
    index.remove(item.id);
    client.del(item.id);
  }
};

const removeItem = (item) => {
  if (!item) return;
  index.remove(item.id);
  client.del(item.id);
};

const editItems = (newItems) => {
  for (let item of newItems) {
    editItem(item);
  }
};

const editItem = async (newItem) => {
  if (!newItem || !newItem.id) return;
  let item = await client.get(newItem.id);
  item = JSON.parse(item);
  if (!item) {
    addItem(newItem);
    return;
  }
  let reinsert = false;
  let name;
  let title;
  if (
    newItem.type === "USER" &&
    (newItem.username !== item.username || newItem.data.name !== item.data.name)
  ) {
    reinsert = true;
    name = newItem.username;
    title = newItem.data.name;
  } else if (
    newItem.type === "SLATE" &&
    (newItem.slatename !== item.slatename || newItem.data.name !== item.data.name)
  ) {
    reinsert = true;
    name = newItem.slatename;
    title = newItem.data.name;
  } else if (
    newItem.type === "FILE" &&
    (newItem.filename !== item.filename || newItem.data.name !== item.data.name)
  ) {
    reinsert = true;
    name = newItem.filename;
    title = newItem.data.name;
  }
  client.set(newItem.id, JSON.stringify(newItem));
  if (reinsert) {
    index.update({ name, title, type: newItem.type, id: newItem.id });
  }
};
