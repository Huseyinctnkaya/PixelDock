// Shared form types used by both admin routes and app proxy routes.
// Keep this file free of React / Polaris imports so it can be safely
// imported in server-only contexts.

export type BlockType =
  | "toggle_group"
  | "input"
  | "select"
  | "file"
  | "textarea"
  | "color"
  | "number"
  | "date"
  | "email"
  | "tel"
  | "checkbox"
  | "checkbox_group"
  | "divider"
  | "info"
  | "multi_file"
  | "rating"
  | "url";

export type FormBlock = {
  id: string;
  type: BlockType;
  label: string;
  name: string;
  required: boolean;
  placeholder?: string;
  options?: string;
  defaultValue?: string;
  accept?: string;
  min?: string;
  max?: string;
};

export type FormStatus = "active" | "draft";

export type FormEntry = {
  id: string;
  name: string;
  title: string;
  submitLabel: string;
  blocks: FormBlock[];
  createdAt: string;
  status: FormStatus;
};

export type FormsRegistry = Record<string, FormEntry>;
