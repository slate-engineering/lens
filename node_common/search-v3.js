import * as Data from "~/node_common/data";

import FlexSearch from "flexsearch";
import Redis from "ioredis";

let index;
let client = new Redis({
  port: process.env.SEARCH_REDIS_PORT,
  host: process.env.SEARCH_REDIS_HOST,
  password: process.env.SEARCH_REDIS_PASSWORD,
});

client.on("connect", function () {
  console.log("connected");
  client.flushall();
  initSearch();
});

client.on("error", function (error) {
  console.log(error);
});

export const initSearch = async () => {
  index = new FlexSearch({
    doc: {
      id: "id",
      field: ["name", "title", "type"],
      store: ["id", "type"],
    },
  });
  let items = [];
  let slates = await Data.getEverySlate();
  for (let slate of slates) {
    items.push({ ...slate, type: "SLATE" });
    if (slate?.data?.objects?.length) {
      for (let i = 0; i < slate.data.objects.length; i++) {
        let file = slate.data.objects[i];
        items.push({
          data: { file, slate: { id: slate.id } },
          type: "FILE",
          id: `${file.id}-${slate.id}`,
        });
      }
    }
  }
  let users = await Data.getEveryUser();
  for (let user of users) {
    items.push({ ...user, type: "USER" });
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

  let slateResults = [];
  if (!type || type === "FILE") {
    let slateIds = results
      .filter((item) => item?.type === "FILE")
      .map((item) => item.data.slate.id);
    if (slateIds && slateIds.length) {
      slateResults = await client.mget(...slateIds);
      slateResults = slateResults.map((res) => JSON.parse(res));
    }
  }
  let ownerResults = [];
  if (!type || type === "SLATE") {
    let ownerIds = results
      .filter((item) => item?.type === "SLATE")
      .map((item) => item.data.ownerId);
    ownerIds.push(...slateResults.map((item) => item?.data.ownerId));
    if (ownerIds?.length) {
      ownerResults = await client.mget(...ownerIds);
      ownerResults = ownerResults.map((res) => JSON.parse(res));
    }
  }

  let slatetable = {};
  for (let result of slateResults) {
    slatetable[result.id] = result;
  }
  let usertable = {};
  for (let result of ownerResults) {
    usertable[result.id] = result;
  }

  let serialized = [];
  for (let item of results) {
    if (!item) {
      continue;
    }
    let ownerId, file, user, slate;
    if (item.type === "USER") {
      user = item;
      ownerId = item.id;
    } else if (item.type === "SLATE") {
      ownerId = item.data.ownerId;
      user = usertable[ownerId];
      slate = item;
    } else if (item.type === "FILE") {
      file = item.data.file;
      let slateId = item.data.slate.id;
      slate = slatetable[slateId];
      if (slate) {
        ownerId = slate.data.ownerId;
        user = usertable[ownerId];
      }
    }
    serialized.push({ type: item.type, file, user, slate, ownerId });
  }
  //NOTE(martina): surface the ownerId (for sorting / filtering) and serialize slates and files with their respective slates + owners
  return serialized;
};

export const updateIndex = (update) => {
  if (update.type === "ADD") {
    // console.log(update.data);
    // console.log("ADD TO TRIE");
    addItem(update.data);
  } else if (update.type === "REMOVE") {
    // console.log(update.data.id);
    // console.log("REMOVE FROM TRIE");
    removeItem(update.data.id);
  } else if (update.type === "EDIT") {
    // console.log(update.data);
    // console.log("EDIT TRIE");
    editItem(update.data);
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
      name = item.data.file.name;
      title = item.data.file.title;
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
    if (item.data.objects && item.data.objects.length) {
      for (let i = 0; i < item.data.objects.length; i++) {
        let file = item.data.objects[i];
        addItem({
          data: { file, slate: { id: item.id } },
          type: "FILE",
          id: `${file.id}-${item.id}`,
        });
      }
    }
  } else if (item.type === "FILE") {
    name = item.data.file.name;
    title = item.data.file.title;
  }
  let id = item.id;
  index.add({ name, title, type: item.type, id });
  client.set(id, JSON.stringify(item));
};

const removeItem = (id) => {
  if (!id) return;
  index.remove(id);
  client.del(id);
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
  if (
    newItem.type === "USER" &&
    (newItem.username !== item.username || newItem.data.name !== item.data.name)
  ) {
    reinsert = true;
  } else if (
    newItem.type === "SLATE" &&
    (newItem.slatename !== item.slatename || newItem.data.name !== item.data.name)
  ) {
    reinsert = true;
  } else if (
    newItem.type === "FILE" &&
    (newItem.data.file.name !== item.data.file.name ||
      newItem.data.file.title !== item.data.file.title)
  ) {
    reinsert = true;
  }
  if (newItem.type === "SLATE") {
    handleFileChanges(newItem, item);
  }

  client.set(newItem.id, JSON.stringify(newItem));
  if (reinsert) {
    index.update(newItem);
  }
};

const handleFileChanges = (slate, prevSlate) => {
  let objs = slate.data.objects;
  let ids = objs.map((file) => file.id);
  let prevObjs = prevSlate.data.objects;
  let prevIds = prevObjs.map((file) => file.id);
  let toAdd = objs.filter((file) => !prevIds.includes(file.id));
  let toRemove = prevObjs.filter((file) => !ids.includes(file.id));
  let remaining = objs.filter((file) => prevIds.includes(file.id));
  for (let file of toRemove) {
    removeItem(`${file.id}-${slate.id}`);
  }
  for (let file of toAdd) {
    addItem({
      data: { file, slate: { id: slate.id } },
      type: "FILE",
      id: `${file.id}-${slate.id}`,
    });
  }
  for (let file of remaining) {
    editItem({
      data: { file, slate: { id: slate.id } },
      type: "FILE",
      id: `${file.id}-${slate.id}`,
    });
  }
};
