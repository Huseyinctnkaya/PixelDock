import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import type { FormEntry, FormsRegistry } from "./app.forms._index";
import { fetchAppSettings } from "./app.settings";

const NAMESPACE = "pixeldock";
const REGISTRY_KEY = "forms_registry";

// GET /apps/pixeldock/config?form_id=xxx
// Called by the theme extension JS to load the merchant's form config.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.public.appProxy(request);

  if (!admin) {
    return corsJson({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const formId = url.searchParams.get("form_id");

  if (!formId) {
    return corsJson({ config: null });
  }

  const res = await admin.graphql(
    `#graphql
    query FormsRegistry($namespace: String!, $key: String!) {
      currentAppInstallation {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { variables: { namespace: NAMESPACE, key: REGISTRY_KEY } },
  );

  const data = (await res.json()) as {
    data?: {
      currentAppInstallation?: { metafield?: { value: string } | null } | null;
    };
  };

  const raw = data.data?.currentAppInstallation?.metafield?.value;

  if (!raw) {
    return corsJson({ config: null });
  }

  let registry: FormsRegistry;
  try {
    registry = JSON.parse(raw) as FormsRegistry;
  } catch {
    return corsJson({ config: null });
  }

  const form: FormEntry | undefined = registry[formId];
  if (!form) {
    return corsJson({ config: null });
  }

  const appSettings = await fetchAppSettings(admin);

  const config = {
    title: form.title,
    submitLabel: form.submitLabel,
    blocks: form.blocks,
    triggerLabel: appSettings.triggerLabel,
    triggerColor: appSettings.triggerColor,
  };

  return corsJson({ config });
};

function corsJson(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
