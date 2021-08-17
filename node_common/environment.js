export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";
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
export const URI_FIJI = process.env.NEXT_PUBLIC_URI_FIJI;
