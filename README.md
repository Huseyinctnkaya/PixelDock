# PixelDock

PixelDock is a Shopify embedded app for reading theme-uploaded images from the active Online Store theme and storing image-specific metadata in Shopify itself.

## What it does

- Lists image assets from the main theme through the Admin GraphQL `theme.files` API
- Shows the asset preview, filename, size, MIME type, and update time inside the app
- Saves per-image metadata (`label`, `altText`, `note`) into an app-owned Shopify metafield
- Keeps the storage on Shopify's side instead of an external image database

## Stack

- Shopify React Router app template
- Shopify App Bridge
- Shopify Admin GraphQL API
- Prisma session storage

## Shopify scopes

The app currently requests:

- `read_themes`

If you change scopes later, re-run auth so the store accepts the updated permissions.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Link or create a Shopify app config:

```bash
shopify app config link
```

3. Start local development:

```bash
npm run dev
```

4. Apply Prisma setup if needed:

```bash
npm run setup
```

## Data model

Theme image metadata is stored in the app installation metafield:

- Namespace: `pixeldock`
- Key: `theme_image_metadata`
- Type: `json`

Each record is keyed by `themeId:filename`, so the app can keep multiple theme assets separated inside one Shopify-side JSON document.

## Important implementation notes

- Theme files are fetched from the live theme first. If no `MAIN` theme is returned, the first available theme is used as a fallback.
- Only files whose `contentType` starts with `image/` are rendered in the UI.
- Clearing all metadata fields for an image and saving again removes that image's record from the JSON metafield.

## Next steps

- Add filtering by filename or section usage
- Parse `config/settings_data.json` to isolate only merchant-selected theme images
- Add bulk sync or export actions
