import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  CalloutCard,
  Card,
  ChoiceList,
  ColorPicker,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Popover,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

// ─── Color conversion helpers ─────────────────────────────────────────────────

type HSB = { hue: number; saturation: number; brightness: number };

function hexToHsb(hex: string): HSB {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  let hue = 0;
  if (diff !== 0) {
    if (max === r) hue = ((g - b) / diff) % 6;
    else if (max === g) hue = (b - r) / diff + 2;
    else hue = (r - g) / diff + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }
  return { hue, saturation: max === 0 ? 0 : diff / max, brightness: max };
}

function hsbToHex({ hue, saturation, brightness }: HSB): string {
  const h = hue / 60;
  const s = saturation;
  const v = brightness;
  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const combos: [number, number, number][] = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]];
  const [r, g, b] = combos[i % 6];
  const hex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

import type { AppSettings } from "../settings.server";
import { SETTINGS_NAMESPACE, SETTINGS_KEY, DEFAULT_APP_SETTINGS, fetchAppSettings } from "../settings.server";

const TYPE_OPTIONS = [
  { label: "PNG", value: "image/png" },
  { label: "JPG / JPEG", value: "image/jpeg" },
  { label: "WEBP", value: "image/webp" },
  { label: "SVG", value: "image/svg+xml" },
];

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const settings = await fetchAppSettings(admin);
  return { settings };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const maxFileSizeMb = Math.min(20, Math.max(1, Number(form.get("maxFileSizeMb")) || 5));
  const acceptedTypes = form.getAll("acceptedTypes") as string[];
  const triggerLabel = (form.get("triggerLabel") as string)?.trim() || DEFAULT_APP_SETTINGS.triggerLabel;
  const triggerColor = (form.get("triggerColor") as string)?.trim() || DEFAULT_APP_SETTINGS.triggerColor;
  const displayMode = (form.get("displayMode") as string) === "inline" ? "inline" : "modal";

  const settings: AppSettings = {
    maxFileSizeMb,
    acceptedTypes: acceptedTypes.length ? acceptedTypes : DEFAULT_APP_SETTINGS.acceptedTypes,
    triggerLabel,
    triggerColor,
    displayMode,
  };

  const appRes = await admin.graphql(`#graphql
    query AppId { currentAppInstallation { id } }`);
  const appData = (await appRes.json()) as {
    data?: { currentAppInstallation?: { id: string } | null };
  };
  const ownerId = appData.data?.currentAppInstallation?.id;
  if (!ownerId) return { ok: false, error: "App installation bulunamadı." };

  const saveRes = await admin.graphql(
    `#graphql
    mutation SaveAppSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          key: SETTINGS_KEY,
          namespace: SETTINGS_NAMESPACE,
          ownerId,
          type: "json",
          value: JSON.stringify(settings),
        }],
      },
    },
  );

  const saveData = (await saveRes.json()) as {
    data?: { metafieldsSet?: { userErrors?: Array<{ message: string }> | null } | null };
  };
  const errors = saveData.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) return { ok: false, error: errors[0].message };
  return { ok: true, error: null };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isSaving = fetcher.state !== "idle";

  const [maxFileSizeMb, setMaxFileSizeMb] = useState(String(settings.maxFileSizeMb));
  const [acceptedTypes, setAcceptedTypes] = useState<string[]>(settings.acceptedTypes);
  const [triggerLabel, setTriggerLabel] = useState(settings.triggerLabel);
  const [triggerColor, setTriggerColor] = useState(settings.triggerColor);
  const [displayMode, setDisplayMode] = useState<string[]>([settings.displayMode]);
  const [colorHsb, setColorHsb] = useState<HSB>(() => hexToHsb(settings.triggerColor));
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const handleColorChange = useCallback((hsb: HSB) => {
    setColorHsb(hsb);
    setTriggerColor(hsbToHex(hsb));
  }, []);

  const saved = fetcher.data?.ok === true;
  const saveError = fetcher.data?.error;

  const handleSave = () => {
    const form = new FormData();
    form.append("maxFileSizeMb", maxFileSizeMb);
    acceptedTypes.forEach((t) => form.append("acceptedTypes", t));
    form.append("triggerLabel", triggerLabel);
    form.append("triggerColor", triggerColor);
    form.append("displayMode", displayMode[0] ?? "modal");
    fetcher.submit(form, { method: "post" });
  };

  return (
    <Page
      title="Ayarlar"
      primaryAction={
        <Button variant="primary" loading={isSaving} onClick={handleSave}>
          Kaydet
        </Button>
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">

            {saved && (
              <Banner tone="success" onDismiss={() => {}}>
                Ayarlar kaydedildi.
              </Banner>
            )}
            {saveError && (
              <Banner tone="critical">{saveError}</Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">
                    Buton Ayarları
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Ürün sayfasında görünen "Patch Ekle" butonunun görünümü.
                  </Text>
                </BlockStack>
                <FormLayout>
                  <TextField
                    label="Buton yazısı"
                    value={triggerLabel}
                    onChange={setTriggerLabel}
                    autoComplete="off"
                    name="triggerLabel"
                  />
                  <ChoiceList
                    title="Form açılış modu"
                    choices={[
                      {
                        label: "Modal (Overlay)",
                        value: "modal",
                        helpText: "Buton tıklandığında ekranın üstünde bir modal pencere açılır.",
                      },
                      {
                        label: "Inline (Sayfa içi)",
                        value: "inline",
                        helpText: "Form, butonun hemen altında kayarak açılır. Sayfadan çıkılmaz.",
                      },
                    ]}
                    selected={displayMode}
                    onChange={setDisplayMode}
                  />
                  <Box>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd">Buton rengi</Text>
                      <InlineStack gap="300" blockAlign="center">
                        <Popover
                          active={colorPickerOpen}
                          activator={
                            <div
                              onClick={() => setColorPickerOpen((o) => !o)}
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: triggerColor,
                                cursor: "pointer",
                                border: "1px solid #ccc",
                              }}
                            />
                          }
                          onClose={() => setColorPickerOpen(false)}
                        >
                          <Box padding="400">
                            <ColorPicker
                              color={colorHsb}
                              onChange={handleColorChange}
                            />
                          </Box>
                        </Popover>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {triggerColor.toUpperCase()}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                </FormLayout>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">
                    Yükleme Sınırları
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Tüm formlar için geçerli olan global yükleme kuralları.
                  </Text>
                </BlockStack>
                <FormLayout>
                  <TextField
                    label="Maksimum dosya boyutu (MB)"
                    value={maxFileSizeMb}
                    onChange={setMaxFileSizeMb}
                    type="number"
                    min="1"
                    max="20"
                    autoComplete="off"
                    name="maxFileSizeMb"
                    helpText="1 ile 20 MB arasında bir değer girin."
                  />
                  <ChoiceList
                    allowMultiple
                    title="Kabul edilen dosya tipleri"
                    choices={TYPE_OPTIONS}
                    selected={acceptedTypes}
                    onChange={setAcceptedTypes}
                  />
                </FormLayout>
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <CalloutCard
              title="Tema entegrasyonu"
              illustration="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              primaryAction={{
                content: "Tema Editörünü aç",
                url: "shopify://admin/themes/current/editor",
              }}
            >
              <Text as="p" variant="bodyMd">
                Block'u eklemek için Tema Editörü → Ürün Sayfası → Block Ekle → Apps → <strong>PixelDock Upload</strong>
              </Text>
            </CalloutCard>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  Hakkında
                </Text>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Uygulama
                  </Text>
                  <Text as="p" variant="bodyMd">
                    PixelDock
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Sürüm
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1.0.0
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

      </Layout>
      <Box paddingBlockEnd="1200" />
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
