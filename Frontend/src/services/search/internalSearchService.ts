import type { SearchResult } from "@/stores/searchStore";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const INTERNAL_RESULTS: SearchResult[] = [
  {
    id: "i-1",
    title: "ErgoFlow Standing Desk Pro",
    image: "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=900&q=80",
    summary: "Electric standing desk with memory presets and cable tray.",
    source: "internal",
    price: 689,
    sourceName: "MyPal Catalog",
    trustLabel: "Inventory verified",
    freshness: "Synced 2m ago",
    badge: "Resident",
  },
  {
    id: "i-2",
    title: "NoiseShield ANC Headphones",
    image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=900&q=80",
    summary: "Comfort-tuned ANC headphones with all-day battery profile.",
    source: "internal",
    price: 259,
    sourceName: "MyPal Catalog",
    trustLabel: "Top rated",
    freshness: "Synced 5m ago",
    badge: "Resident",
  },
];

export const internalSearchService = {
  async search(query: string): Promise<{ results: SearchResult[] }> {
    await wait(500);
    const lowered = query.toLowerCase();
    const results = INTERNAL_RESULTS.filter((item) => item.title.toLowerCase().includes(lowered) || item.summary.toLowerCase().includes(lowered));
    return { results: results.length ? results : INTERNAL_RESULTS };
  },
};
