import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import type { FormConfig } from "./app.builder";

const NAMESPACE = "pixeldock";
const FORM_CONFIG_KEY = "form_config";

// GET /apps/pixeldock/config
// Called by the theme extension JS to load the merchant's form config.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.public.appProxy(request);

  if (!admin) {
    return corsJson({ error: "Unauthorized" }, 401);
  }

  const res = await admin.graphql(
    `#graphql
    query FormConfig($namespace: String!, $key: String!) {
      currentAppInstallation {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { variables: { namespace: NAMESPACE, key: FORM_CONFIG_KEY } },
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

  let config: FormConfig;
  try {
    config = JSON.parse(raw);
  } catch {
    return corsJson({ config: null });
  }

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
