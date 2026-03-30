import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchAppSettings } from "../settings.server";

// POST /apps/pixeldock/upload
// Called by the theme extension via app proxy.
// Accepts a multipart file, stages it in Shopify Files, and returns the CDN URL.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return corsJson({ error: "Method not allowed" }, 405);
  }

  const { admin } = await authenticate.public.appProxy(request);

  if (!admin) {
    return corsJson({ error: "Unauthorized" }, 401);
  }

  const appSettings = await fetchAppSettings(admin);

  let file: File | null = null;

  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return corsJson({ error: "Invalid form data" }, 400);
  }

  if (!file || file.size === 0) {
    return corsJson({ error: "No file provided" }, 400);
  }

  if (!appSettings.acceptedTypes.includes(file.type)) {
    return corsJson({ error: `Kabul edilen dosya tipleri: ${appSettings.acceptedTypes.join(", ")}` }, 400);
  }

  const MAX_BYTES = appSettings.maxFileSizeMb * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return corsJson({ error: `Dosya ${appSettings.maxFileSizeMb} MB sınırını aşıyor` }, 400);
  }

  // --- Step 1: Create staged upload target ---
  const stagingRes = await admin.graphql(
    `#graphql
    mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: [
          {
            filename: file.name,
            mimeType: file.type,
            fileSize: file.size.toString(),
            resource: "FILE",
            httpMethod: "POST",
          },
        ],
      },
    }
  );

  const stagingData = (await stagingRes.json()) as {
    data?: {
      stagedUploadsCreate?: {
        stagedTargets?: Array<{
          url: string;
          resourceUrl: string;
          parameters: Array<{ name: string; value: string }>;
        }> | null;
        userErrors?: Array<{ message: string }> | null;
      } | null;
    };
  };

  const userErrors = stagingData.data?.stagedUploadsCreate?.userErrors ?? [];
  if (userErrors.length) {
    return corsJson({ error: userErrors[0].message }, 500);
  }

  const target = stagingData.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    return corsJson({ error: "Staged upload target could not be created" }, 500);
  }

  // --- Step 2: Upload file to the staged S3 target ---
  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append("file", file);

  const s3Res = await fetch(target.url, { method: "POST", body: uploadForm });
  if (!s3Res.ok) {
    return corsJson({ error: "File upload to staging storage failed" }, 500);
  }

  // --- Step 3: Register the file in Shopify Files ---
  const fileCreateRes = await admin.graphql(
    `#graphql
    mutation FileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on MediaImage {
            id
            image { url }
          }
          ... on GenericFile {
            id
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        files: [
          {
            alt: file.name,
            contentType: "IMAGE",
            originalSource: target.resourceUrl,
          },
        ],
      },
    }
  );

  const fileData = (await fileCreateRes.json()) as {
    data?: {
      fileCreate?: {
        files?: Array<{
          id?: string;
          image?: { url: string } | null;
          url?: string | null;
        }> | null;
        userErrors?: Array<{ message: string }> | null;
      } | null;
    };
  };

  const createErrors = fileData.data?.fileCreate?.userErrors ?? [];
  if (createErrors.length) {
    // Non-fatal: return the staged resource URL as fallback
    return corsJson({ ok: true, fileUrl: target.resourceUrl });
  }

  const created = fileData.data?.fileCreate?.files?.[0];
  const fileUrl = created?.image?.url ?? created?.url ?? target.resourceUrl;

  return corsJson({ ok: true, fileUrl });
};

// CORS-friendly JSON response so the storefront fetch() works cross-origin.
function corsJson(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
