import mammoth from "mammoth";

export async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value.trim()
  };
}
