import DB from "~/node_common/database";

export const user = (entity) => {
  return {
    type: "USER",
    id: entity.id,
    username: entity.username,
    slates: entity.slates ? entity.slates : [],
    data: {
      name: entity.data.name ? entity.data.name : "",
      photo: entity.data.photo ? entity.data.photo : "",
      body: entity.data.body ? entity.data.body : "",
    },
  };
};

export const slate = (entity) => {
  return {
    type: "SLATE",
    id: entity.id,
    slatename: entity.slatename,
    data: {
      ownerId: entity.data.ownerId,
      name: entity.data.name ? entity.data.name : "",
      body: entity.data.body ? entity.data.body : "",
      objects: entity.data.objects,
      layouts: entity.data.layouts,
    },
  };
};

export const doSlates = async ({ serializedUsers, slates }) => {
  const userToSlatesMap = {};

  const sanitized = slates.map((d) => {
    let o = null;

    if (userToSlatesMap[d.data.ownerId]) {
      userToSlatesMap[d.data.ownerId].push(d);
    }

    if (!userToSlatesMap[d.data.ownerId]) {
      userToSlatesMap[d.data.ownerId] = [d];
    }

    if (d.data.ownerId) {
      o = serializedUsers.find((e) => d.data.ownerId === e.id);
    }

    return { ...d, owner: o };
  });

  return {
    serializedSlates: JSON.parse(JSON.stringify(sanitized)),
    userToSlatesMap,
  };
};