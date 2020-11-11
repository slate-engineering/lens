import * as Data from "~/node_common/data";
import * as Strings from "~/common/strings";

const _cache = {}; //cache recently searched (how to update if it changes? is caching only short term?)

export const slatesTrie = {};
export const usersTrie = {};
export const filesTrie = {};
export const hashtable = {};

const MIN_WEIGHT = 0.8;

export const initSearch = async () => {
  let slates = await Data.getEverySlate();
  for (let slate of slates) {
    addItem({ ...slate, type: "SLATE" });
  }
  let users = await Data.getEveryUser();
  for (let user of users) {
    addItem({ ...user, type: "USER" });
  }
};
//maybe record saved at when updating records, and only update if it's more recent
//if I'm saving the cached search queries by query, I can check if the incoming change's search terms would overlap with any cached queries, and if they do, remove them from the cache (since they're no longer relevant)

export const search = (query, type) => {
  console.log(`QUERY: ${query}`);
  //check the cache
  let searchResults = [];
  let searchTerms = parseSearchTerms([query]);
  console.log(searchTerms);
  for (let term of searchTerms) {
    if (type === "USER" || !type) {
      searchResults.push(...searchFuzzy(term, usersTrie, 1 / term.length));
    }
    if (type === "SLATE" || !type) {
      searchResults.push(...searchFuzzy(term, slatesTrie, 1 / term.length));
    }
    if (type === "FILE" || !type) {
      searchResults.push(...searchFuzzy(term, filesTrie, 1 / term.length));
    }
  }
  let resultIds = {};
  let noRepeats = [];
  for (let i = 0; i < searchResults.length; i++) {
    let id = searchResults[i].data.value.id;
    if (resultIds.hasOwnProperty(id)) {
      let index = resultIds[id];
      noRepeats[index].weight += searchResults[i].weight;
    } else {
      resultIds[id] = noRepeats.length;
      noRepeats.push(searchResults[i]);
    }
  }
  let results = searchResults.map((res) => {
    let item = res.data.value;
    let ownerId;
    if (item.type === "USER") {
      ownerId = item.id;
    } else if (item.type === "SLATE") {
      ownerId = item.data.ownerId;
      if (hashtable[ownerId]) {
        item.owner = hashtable[ownerId].data.value;
      }
    } else if (item.type === "FILE") {
      let slateId = item.data.slate.id;
      if (hashtable[slateId]) {
        item.data.slate = hashtable[slateId].data.value;
        ownerId = hashtable[slateId].data.value.data.ownerId;

        if (hashtable[ownerId]) {
          item.data.slate.owner = hashtable[ownerId].data.value;
        }
      }
    }
    return { ...res, ownerId };
  });
  //NOTE(martina): surface the ownerId (for sorting / filtering) and serialize slates and files with their respective slates + owners
  return results;
};

const searchExact = (term, curr) => {
  if (Object.keys(curr).length === 0) return [];
  let chars = term.split("");
  for (let i = 0; i < chars.length; i++) {
    let c = chars[i];
    if (!curr[c]) {
      return [];
    }
    curr = curr[c];
  }
  return curr.results ? Object.values(curr.results) : [];
};

const searchFuzzy = (term, curr, charWeight, weight = 1) => {
  if (!term.length) {
    let searchResults = [];
    if (weight > MIN_WEIGHT) {
      console.log("below min weight");
      for (let char of Object.keys(curr)) {
        if (char.length === 1) {
          searchResults.push(...searchFuzzy(term, curr[char], charWeight, weight - charWeight)); //NOTE(martina): missing last letter
        }
      }
      searchResults.push(...searchAllLeaves(curr)); //NOTE(martina): autocomplete search (limit 15 results)
    }
    if (curr.results) {
      searchResults.push(
        ...Object.values(curr.results).map((res) => {
          return { data: res, weight };
        })
      );
    }
    return searchResults;
  }
  let results = [];
  let nextChar = term.charAt(0);
  if (curr[nextChar]) {
    results.push(...searchFuzzy(term.slice(1), curr[nextChar], charWeight, weight));
  }
  if (weight - charWeight > MIN_WEIGHT) {
    for (let char of Object.keys(curr)) {
      if (char.length === 1 && char !== term.charAt(0)) {
        results.push(...searchFuzzy(term.slice(1), curr[char], charWeight, weight - charWeight)); //NOTE(martina): wrong letter
      }
    }
    if (term.length >= 2) {
      results.push(
        ...searchFuzzy(
          `${term.charAt(1)}${term.charAt(0)}${term.slice(2)}`,
          curr,
          charWeight,
          weight - charWeight
        )
      ); //NOTE(martina): swapped letters
    }
    if (curr[nextChar]) {
      results.push(...searchFuzzy(term, curr[nextChar], charWeight, weight - charWeight)); //NOTE(martina): missing letter
    }
    results.push(...searchFuzzy(term.slice(1), curr, charWeight, weight - charWeight)); //NOTE(martina): extra letter
  }
  return results;
};

const searchAllLeaves = (curr) => {
  let results = searchLeavesRecursive(curr);
  if (!results || !results.length) {
    return [];
  }
  results.sort((a, b) => a.length - b.length);
  let maxLength = results[0].length;
  let searchResults = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = 0; j < Math.min(5, results[i].length); j++) {
      let res = results[i][j];
      searchResults.push({ data: res, weight: 0.8 - 0.05 * (maxLength - results[i].length) });
      if (searchResults.length >= 15) {
        return searchResults;
      }
    }
  }
  return searchResults;
};

const searchLeavesRecursive = (curr, depth = 0) => {
  let results = [];
  if (curr.results && depth > 1) {
    results.push(Object.values(curr.results));
  }
  for (let char of Object.keys(curr)) {
    if (char.length === 1) {
      results.push(...searchLeavesRecursive(curr[char], depth + 1));
    }
  }
  return results;
};

const parseSearchTerms = (names) => {
  let searchTerms = [];
  for (let name of names) {
    if (Strings.isEmpty(name)) continue;
    let terms = name.toLowerCase().split(/[-\s_,.\/?!@&]/);
    for (let term of terms) {
      if (!searchTerms.includes(term)) {
        searchTerms.push(term);
      }
    }
  }
  return searchTerms;
};

const parseTags = () => {
  //a tag should end at punctuation, or a space. it can include numbers, dashes, underscores
  //it shoudl be converted to lowercase
  //could also do this at the db storage stage if preferable. applies to users, slates, and files
};

export const updateTrie = (update) => {
  if (update.type === "ADD") {
    console.log(update.data);
    console.log("ADD TO TRIE");
    addItem(update.data);
  } else if (update.type === "REMOVE") {
    console.log(update.data.id);
    console.log("REMOVE FROM TRIE");
    removeItem(update.data.id);
  } else if (update.type === "EDIT") {
    console.log(update.data);
    console.log("EDIT TRIE");
    editItem(update.data);
  }
};

const addItem = (item) => {
  let searchTerms = [];
  if (item.type === "USER") {
    searchTerms = parseSearchTerms([item.username, item.data.name]);
  } else if (item.type === "SLATE") {
    searchTerms = parseSearchTerms([item.slatename, item.data.name]);
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
    searchTerms = parseSearchTerms([item.data.file.name, item.data.file.title]);
  }
  if (!searchTerms || !searchTerms.length) return;
  let id = item.id;
  let data = { value: item }; //NOTE(martina): nest it one layer deep so that can reassign a new value to VALUE while maintaining the hashtable's pointer to it
  hashtable[id] = { terms: searchTerms, data, type: data.value.type };

  let trie;
  if (item.type === "USER") {
    trie = usersTrie;
  } else if (item.type === "SLATE") {
    trie = slatesTrie;
  } else if (item.type === "FILE") {
    trie = filesTrie;
  } else {
    return;
  }
  for (let term of searchTerms) {
    addToTrie(term, trie, data);
  }
};

const addToTrie = (searchTerm, curr, data) => {
  if (!curr) return;
  let chars = searchTerm.split("");
  for (let i = 0; i < chars.length; i++) {
    let c = chars[i];
    if (!curr[c]) {
      curr[c] = {};
    }
    curr = curr[c];
    if (i === chars.length - 1) {
      if (!curr.results) {
        curr.results = {};
      }
      curr.results[data.value.id] = data;
    }
  }
};

const removeItem = (id) => {
  if (!hashtable[id]) return;
  let searchTerms = hashtable[id].terms;
  if (!searchTerms || !searchTerms.length) return;

  let trie;
  if (hashtable[id].type === "USER") {
    console.log("remove user!");
    trie = usersTrie;
  } else if (hashtable[id].type === "SLATE") {
    console.log("remove slate!");
    trie = slatesTrie;
    let slate = hashtable[id].data.value;
    if (slate.data.objects && slate.data.objects.length) {
      for (let file of slate.data.objects) {
        removeItem(`${file.id}-${slate.id}`);
      }
    }
  } else if (hashtable[id].type === "FILE") {
    console.log("remove file!");
    trie = filesTrie;
  }
  for (let term of searchTerms) {
    removeFromTrie(term, trie, id);
  }
  delete hashtable[id];
};

const removeFromTrie = (searchTerm, curr, id) => {
  let chars = searchTerm.split("");
  for (let i = 0; i < chars.length; i++) {
    let c = chars[i];
    if (!curr[c]) {
      return;
    }
    curr = curr[c];
    if (i === chars.length - 1) {
      if (!curr.results || !curr.results[id]) {
        return;
      }
      delete curr.results[id];
    }
  }
};

const editItem = (data) => {
  let item = hashtable[data.id];
  if (!item || !item.data || !item.data.value) return;
  let oldData = item.data.value;
  let reinsert = false;
  if (
    data.type === "USER" &&
    (data.username !== oldData.username || data.data.name !== oldData.data.name)
  ) {
    reinsert = true;
  } else if (
    data.type === "SLATE" &&
    (data.slatename !== oldData.slatename || data.data.name !== oldData.data.name)
  ) {
    reinsert = true;
  } else if (
    data.type === "FILE" &&
    (data.data.file.name !== oldData.data.file.name ||
      data.data.file.title !== oldData.data.file.title)
  ) {
    reinsert = true;
  }
  if (data.type === "SLATE") {
    handleFileChanges(data, item.data.value);
  }

  item.data.value = data;
  if (reinsert) {
    reinsertItem(item.data);
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
    addItem(
      {
        data: { file, slate: { id: slate.id } },
        type: "FILE",
        id: `${file.id}-${slate.id}`,
      }
      //   {
      //   ...file,
      //   type: "FILE",
      //   data: { slate: { id: slate.id } }, //fill in the index and the full slate info when you retrieve it
      //   id: `${file.id}-${slate.id}`,
      // }
    );
  }
  for (let file of remaining) {
    editItem(
      {
        data: { file, slate: { id: slate.id } },
        type: "FILE",
        id: `${file.id}-${slate.id}`,
      }
      //   {
      //   ...file,
      //   type: "FILE",
      //   data: { slate: { id: slate.id } },
      //   id: `${file.id}-${slate.id}`,
      // }
    );
  }
};

const reinsertItem = (data) => {
  if (!hashtable[data.value.id]) return;
  let currTerms = hashtable[data.value.id].terms;
  let newTerms;
  let trie;
  if (data.value.type === "USER") {
    trie = usersTrie;
    newTerms = parseSearchTerms([data.value.username, data.value.data.name]);
  } else if (data.value.type === "SLATE") {
    trie = slatesTrie;
    newTerms = parseSearchTerms([data.value.slatename, data.value.data.name]);
  } else if (data.value.type === "FILE") {
    trie = filesTrie;
    newTerms = parseSearchTerms([data.value.data.file.name, data.value.data.file.title]);
  } else {
    return;
  }
  let toAdd = newTerms.filter((term) => !currTerms.includes(term));
  let toRemove = currTerms.filter((term) => !newTerms.includes(term));
  for (let term of toRemove) {
    removeFromTrie(term, trie, data.value.id);
  }
  for (let term of toAdd) {
    addToTrie(term, trie, data);
  }
  hashtable[data.value.id].terms = newTerms;
};
