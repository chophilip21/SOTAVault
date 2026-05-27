export type GithubRepoStatus = "ok" | "pending" | "unreachable" | "invalid";

export type GithubRepoMetadata = {
  full_name: string;
  stars?: number | null;
  forks?: number | null;
  pushed_at?: string | null;
};

export type GithubRepoMetadataItem = {
  status: GithubRepoStatus;
  data?: GithubRepoMetadata | null;
};

export type GithubRepoMetadataResponse = {
  items: Record<string, GithubRepoMetadataItem>;
  pending: string[];
};

// Normalize a repo string into "owner/name" (lowercased) when it's a GitHub repo.
// Accepts:
// - "owner/name"
// - "https://github.com/owner/name"
// - "git+https://github.com/owner/name.git"
export function normalizeGithubRepo(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  let owner = "";
  let name = "";

  if (raw.includes("github.com")) {
    try {
      const cleaned = raw.replace(/^git\+/, "");
      const u = new URL(cleaned);
      if (!u.hostname.toLowerCase().endsWith("github.com")) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      owner = parts[0];
      name = parts[1];
    } catch {
      return null;
    }
  } else {
    const parts = raw.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    owner = parts[0];
    name = parts[1];
  }

  if (!owner || !name) return null;
  if (name.endsWith(".git")) name = name.slice(0, -4);

  const key = `${owner.toLowerCase()}/${name.toLowerCase()}`;
  // Conservative validation
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(key)) return null;
  return key;
}

