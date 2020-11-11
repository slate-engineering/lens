export const NODE = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE === "production";
export const PORT = process.env.PORT || 1313;
export const SOURCE = process.env.SOURCE;

// NOTE(jim):
// In production we don't use .env and manage secrets another way.
if (!IS_PRODUCTION) {
  require("dotenv").config();
}

export const POSTGRES_ADMIN_PASSWORD = process.env.POSTGRES_ADMIN_PASSWORD;
export const POSTGRES_ADMIN_USERNAME = process.env.POSTGRES_ADMIN_USERNAME;
export const POSTGRES_HOSTNAME = process.env.POSTGRES_HOSTNAME;
export const POSTGRES_DATABASE = process.env.POSTGRES_DATABASE;
export const RESOURCE_URI_PUBSUB = process.env.RESOURCE_URI_PUBSUB;
