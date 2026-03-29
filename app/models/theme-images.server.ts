type GraphqlClient = {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

const METADATA_NAMESPACE = "pixeldock";
const METADATA_KEY = "theme_image_metadata";
const THEME_FILES_PAGE_SIZE = 100;

type ThemeSummary = {
  id: string;
  name: string;
  role: string;
};

type ThemeFilesBody =
  | {
      __typename: "OnlineStoreThemeFileBodyUrl";
      url: string;
    }
  | {
      __typename: "OnlineStoreThemeFileBodyBase64";
      contentBase64: string;
    }
  | {
      __typename: "OnlineStoreThemeFileBodyText";
      content: string;
    }
  | null;

type ThemeFileNode = {
  body: ThemeFilesBody;
  contentType: string | null;
  filename: string;
  size: number | string | null;
  updatedAt: string | null;
};

export type ThemeImageMetadata = {
  altText: string;
  filename: string;
  imageUrl: string;
  label: string;
  note: string;
  syncedAt: string;
  themeId: string;
  themeName: string;
};

export type ThemeImageRecord = {
  contentType: string;
  filename: string;
  key: string;
  metadata: ThemeImageMetadata | null;
  size: number;
  updatedAt: string | null;
  url: string;
};

export type ThemeImageDashboardData = {
  images: ThemeImageRecord[];
  metafieldUpdatedAt: string | null;
  storageKey: string;
  theme: ThemeSummary | null;
};

type AppInstallationContext = {
  id: string;
  metafield: {
    updatedAt: string | null;
    value: string;
  } | null;
};

type SaveThemeImageMetadataInput = {
  altText: string;
  filename: string;
  imageUrl: string;
  label: string;
  note: string;
  themeId: string;
  themeName: string;
};

export function getMetadataStorageKey(themeId: string, filename: string) {
  return `${themeId}:${filename}`;
}

export async function getThemeImageDashboardData(
  admin: GraphqlClient,
): Promise<ThemeImageDashboardData> {
  const appContext = await getAppInstallationContext(admin);
  const metadataMap = parseMetadataMap(appContext.metafield?.value);
  const theme = await getPrimaryTheme(admin);

  if (!theme) {
    return {
      images: [],
      metafieldUpdatedAt: appContext.metafield?.updatedAt ?? null,
      storageKey: `${METADATA_NAMESPACE}.${METADATA_KEY}`,
      theme: null,
    };
  }

  const files = await getThemeFiles(admin, theme.id);

  const images = files
    .reduce<ThemeImageRecord[]>((result, file) => {
      const url = getThemeFileUrl(file);

      if (!url || !file.contentType?.startsWith("image/")) {
        return result;
      }

      const key = getMetadataStorageKey(theme.id, file.filename);

      result.push({
        contentType: file.contentType,
        filename: file.filename,
        key,
        metadata: metadataMap[key] ?? null,
        size: toNumber(file.size),
        updatedAt: file.updatedAt,
        url,
      });

      return result;
    }, [])
    .sort((left, right) => {
      const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0;
      const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0;

      return rightTime - leftTime;
    });

  return {
    images,
    metafieldUpdatedAt: appContext.metafield?.updatedAt ?? null,
    storageKey: `${METADATA_NAMESPACE}.${METADATA_KEY}`,
    theme,
  };
}

export async function saveThemeImageMetadata(
  admin: GraphqlClient,
  input: SaveThemeImageMetadataInput,
) {
  const appContext = await getAppInstallationContext(admin);
  const metadataMap = parseMetadataMap(appContext.metafield?.value);
  const key = getMetadataStorageKey(input.themeId, input.filename);
  const hasMetadata = Boolean(input.label || input.altText || input.note);

  if (hasMetadata) {
    metadataMap[key] = {
      altText: input.altText,
      filename: input.filename,
      imageUrl: input.imageUrl,
      label: input.label,
      note: input.note,
      syncedAt: new Date().toISOString(),
      themeId: input.themeId,
      themeName: input.themeName,
    };
  } else {
    delete metadataMap[key];
  }

  const response = await admin.graphql(
    `#graphql
      mutation SaveThemeImageMetadata($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            key: METADATA_KEY,
            namespace: METADATA_NAMESPACE,
            ownerId: appContext.id,
            type: "json",
            value: JSON.stringify(metadataMap),
          },
        ],
      },
    },
  );

  const payload = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        metafields?: Array<{
          updatedAt?: string | null;
        } | null> | null;
        userErrors?: Array<{
          message?: string | null;
        } | null> | null;
      } | null;
    };
    errors?: Array<{
      message?: string;
    }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || "Metadata save failed.");
  }

  const userErrors = payload.data?.metafieldsSet?.userErrors ?? [];

  if (userErrors.length) {
    throw new Error(userErrors[0]?.message || "Metadata save failed.");
  }

  return {
    deleted: !hasMetadata,
    key,
    updatedAt:
      payload.data?.metafieldsSet?.metafields?.[0]?.updatedAt ?? new Date().toISOString(),
  };
}

async function getAppInstallationContext(admin: GraphqlClient) {
  const response = await admin.graphql(
    `#graphql
      query AppInstallationContext($namespace: String!, $key: String!) {
        currentAppInstallation {
          id
          metafield(namespace: $namespace, key: $key) {
            updatedAt
            value
          }
        }
      }`,
    {
      variables: {
        key: METADATA_KEY,
        namespace: METADATA_NAMESPACE,
      },
    },
  );

  const payload = (await response.json()) as {
    data?: {
      currentAppInstallation?: AppInstallationContext | null;
    };
    errors?: Array<{
      message?: string;
    }>;
  };

  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || "App installation data could not be loaded.",
    );
  }

  const appInstallation = payload.data?.currentAppInstallation;

  if (!appInstallation) {
    throw new Error("App installation data could not be loaded.");
  }

  return appInstallation;
}

async function getPrimaryTheme(admin: GraphqlClient): Promise<ThemeSummary | null> {
  const response = await admin.graphql(
    `#graphql
      query ThemeList {
        themes(first: 20) {
          nodes {
            id
            name
            role
          }
        }
      }`,
  );

  const payload = (await response.json()) as {
    data?: {
      themes?: {
        nodes?: ThemeSummary[] | null;
      } | null;
    };
    errors?: Array<{
      message?: string;
    }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || "Themes could not be loaded.");
  }

  const themes = payload.data?.themes?.nodes ?? [];

  return themes.find((theme) => theme.role === "MAIN") ?? themes[0] ?? null;
}

async function getThemeFiles(admin: GraphqlClient, themeId: string) {
  const files: ThemeFileNode[] = [];
  let after: string | null = null;

  do {
    const response = await admin.graphql(
      `#graphql
        query ThemeFiles($after: String, $themeId: ID!) {
          theme(id: $themeId) {
            files(first: ${THEME_FILES_PAGE_SIZE}, after: $after) {
              nodes {
                body {
                  __typename
                  ... on OnlineStoreThemeFileBodyBase64 {
                    contentBase64
                  }
                  ... on OnlineStoreThemeFileBodyText {
                    content
                  }
                  ... on OnlineStoreThemeFileBodyUrl {
                    url
                  }
                }
                contentType
                filename
                size
                updatedAt
              }
              pageInfo {
                endCursor
                hasNextPage
              }
              userErrors {
                code
                filename
              }
            }
          }
        }`,
      {
        variables: { after, themeId },
      },
    );

    const payload = (await response.json()) as {
      data?: {
        theme?: {
          files?: {
            nodes?: ThemeFileNode[] | null;
            pageInfo?: {
              endCursor?: string | null;
              hasNextPage?: boolean | null;
            } | null;
            userErrors?: Array<{
              code?: string | null;
              filename?: string | null;
            } | null> | null;
          } | null;
        } | null;
      };
      errors?: Array<{
        message?: string;
      }>;
    };

    if (payload.errors?.length) {
      throw new Error(payload.errors[0]?.message || "Theme files could not be loaded.");
    }

    const themeFiles = payload.data?.theme?.files;

    if (!themeFiles) {
      break;
    }

    if (themeFiles.userErrors?.length) {
      throw new Error("Theme files could not be loaded.");
    }

    files.push(...(themeFiles.nodes ?? []));
    after = themeFiles.pageInfo?.hasNextPage
      ? themeFiles.pageInfo.endCursor ?? null
      : null;
  } while (after);

  return files;
}

function getThemeFileUrl(file: ThemeFileNode) {
  if (file.body?.__typename === "OnlineStoreThemeFileBodyUrl") {
    return file.body.url;
  }

  if (
    file.body?.__typename === "OnlineStoreThemeFileBodyBase64" &&
    file.contentType
  ) {
    return `data:${file.contentType};base64,${file.body.contentBase64}`;
  }

  return null;
}

function parseMetadataMap(rawValue: string | null | undefined) {
  if (!rawValue) {
    return {} as Record<string, ThemeImageMetadata>;
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, ThemeImageMetadata>;
    }

    return parsed as Record<string, ThemeImageMetadata>;
  } catch {
    return {} as Record<string, ThemeImageMetadata>;
  }
}

function toNumber(value: number | string | null) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
