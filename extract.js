import mammoth from "mammoth";

export async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value || "").replace(/\r/g, "").trim();
  return { text };
}
