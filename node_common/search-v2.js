import * as Data from "~/node_common/data";
import FlexSearch from "flexsearch";

let index;
export const hashtable = {};

export const initSearch = async () => {
  index = new FlexSearch({
    doc: {
      id: "id",
      field: ["name", "title", "type"],
      store: ["id", "type"],
    },
  });
  let slates = await Data.getEverySlate();
  for (let slate of slates) {
    addItem({ ...slate, type: "SLATE" });
  }
  let users = await Data.getEveryUser();
  for (let user of users) {
    addItem({ ...user, type: "USER" });
  }
};

export const search = (query, type) => {
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
  let results = resultIds.map((res) => {
    let item = hashtable[res.id];
    let ownerId;
    if (item.type === "USER") {
      ownerId = item.id;
    } else if (item.type === "SLATE") {
      ownerId = item.data.ownerId;
      if (hashtable[ownerId]) {
        item.owner = hashtable[ownerId];
      }
    } else if (item.type === "FILE") {
      let slateId = item.data.slate.id;
      if (hashtable[slateId]) {
        item.data.slate = hashtable[slateId];
        ownerId = hashtable[slateId].data.ownerId;

        if (hashtable[ownerId]) {
          item.data.slate.owner = hashtable[ownerId];
        }
      }
    }
    return { item, ownerId };
  });
  //NOTE(martina): surface the ownerId (for sorting / filtering) and serialize slates and files with their respective slates + owners
  return results;
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

const addItem = (item) => {
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
  hashtable[id] = item;
};

const removeItem = (id) => {
  index.remove(id);
  delete hashtable[id];
};

const editItem = (newItem) => {
  let item = hashtable[newItem.id];
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

  hashtable[newItem.id] = newItem;
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
