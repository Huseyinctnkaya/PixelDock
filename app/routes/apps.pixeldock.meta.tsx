import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// POST /apps/pixeldock/meta
// Called by the theme extension after cart add to persist metafield values.
// Body JSON: { variantId: "gid://shopify/ProductVariant/123", fields: [{ key: "pixeldock.logo_url", value: "https://..." }] }
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return corsJson({ error: "Method not allowed" }, 405);
  }

  const { admin } = await authenticate.public.appProxy(request);
  if (!admin) return corsJson({ error: "Unauthorized" }, 401);

  let body: { variantId?: string; fields?: Array<{ key: string; value: string }> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson({ error: "Invalid JSON" }, 400);
  }

  const { variantId, fields } = body;

  if (!variantId || !fields?.length) {
    return corsJson({ ok: true }); // nothing to do
  }

  // Resolve productId from variantId
  const variantRes = await admin.graphql(
    `#graphql
    query VariantProduct($id: ID!) {
      productVariant(id: $id) {
        product { id }
      }
    }`,
    { variables: { id: variantId } },
  );
  const variantData = (await variantRes.json()) as {
    data?: { productVariant?: { product?: { id: string } | null } | null };
  };
  const productId = variantData.data?.productVariant?.product?.id;
  if (!productId) return corsJson({ error: "Product not found" }, 404);

  // Build metafields input — split "namespace.key" → { namespace, key }
  const metafieldsInput = fields
    .filter((f) => f.key && f.value !== undefined && f.value !== "")
    .map((f) => {
      const dotIdx = f.key.indexOf(".");
      const namespace = dotIdx > -1 ? f.key.slice(0, dotIdx) : "pixeldock";
      const key = dotIdx > -1 ? f.key.slice(dotIdx + 1) : f.key;
      return {
        ownerId: productId,
        namespace,
        key,
        type: "single_line_text_field",
        value: String(f.value),
      };
    });

  if (!metafieldsInput.length) return corsJson({ ok: true });

  const saveRes = await admin.graphql(
    `#graphql
    mutation SaveProductMeta($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    { variables: { metafields: metafieldsInput } },
  );

  const saveData = (await saveRes.json()) as {
    data?: { metafieldsSet?: { userErrors?: Array<{ message: string }> | null } | null };
  };
  const errors = saveData.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) return corsJson({ error: errors[0].message }, 500);

  return corsJson({ ok: true });
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
