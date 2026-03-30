export const SETTINGS_NAMESPACE = "pixeldock";
export const SETTINGS_KEY = "app_settings";

export type AppSettings = {
  maxFileSizeMb: number;
  acceptedTypes: string[];
  triggerLabel: string;
  triggerColor: string;
  displayMode: "modal" | "inline";
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  maxFileSizeMb: 5,
  acceptedTypes: ["image/png", "image/jpeg"],
  triggerLabel: "Patch Ekle",
  triggerColor: "#C84B11",
  displayMode: "modal",
};

type AdminGraphQL = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<unknown> }>;
};

export async function fetchAppSettings(
  admin: AdminGraphQL,
): Promise<AppSettings> {
  try {
    const res = await admin.graphql(
      `#graphql
      query AppSettings($namespace: String!, $key: String!) {
        currentAppInstallation {
          metafield(namespace: $namespace, key: $key) { value }
        }
      }`,
      { variables: { namespace: SETTINGS_NAMESPACE, key: SETTINGS_KEY } },
    );
    const data = (await res.json()) as {
      data?: { currentAppInstallation?: { metafield?: { value: string } | null } | null };
    };
    const raw = data.data?.currentAppInstallation?.metafield?.value;
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      maxFileSizeMb: parsed.maxFileSizeMb ?? DEFAULT_APP_SETTINGS.maxFileSizeMb,
      acceptedTypes: Array.isArray(parsed.acceptedTypes) && parsed.acceptedTypes.length
        ? parsed.acceptedTypes
        : DEFAULT_APP_SETTINGS.acceptedTypes,
      triggerLabel: parsed.triggerLabel ?? DEFAULT_APP_SETTINGS.triggerLabel,
      triggerColor: parsed.triggerColor ?? DEFAULT_APP_SETTINGS.triggerColor,
      displayMode: parsed.displayMode ?? DEFAULT_APP_SETTINGS.displayMode,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}
