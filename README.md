# Lens

A lightweight server for returning serialized for users and slates in various ways

### Environment Variables

To use this with https://github.com/filecoin-project/slate you need the following environment variables. Use your current development `.env` variables.

```sh
POSTGRES_ADMIN_PASSWORD=XXX
POSTGRES_ADMIN_USERNAME=XXX
POSTGRES_HOSTNAME=XXX
POSTGRES_DATABASE=XXX
SOURCE=lens
```

### Run the server

```sh
npm install
npm run dev
```
