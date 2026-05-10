import type { SearchResult } from "@/stores/searchStore";

type SearchEvent = { type: "log"; message: string } | { type: "result"; results: SearchResult[] };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const externalResults: SearchResult[] = [
  {
    id: "e-1",
    title: "AeroLite 14 Ultrabook",
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900&q=80",
    summary: "Ranked high for portability and battery quality.",
    source: "external",
    price: 1199,
    sourceName: "TechRadar",
    trustLabel: "Authority score 94",
    freshness: "Crawled 40s ago",
    destinationUrl: "https://example.com/product/ultrabook",
    badge: "Web Agent",
  },
  {
    id: "e-2",
    title: "PulseDesk 4K Monitor",
    image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=900&q=80",
    summary: "Strong color profile and pricing trend over 30 days.",
    source: "external",
    price: 499,
    sourceName: "Global Retail Feed",
    trustLabel: "Authority score 89",
    freshness: "Crawled 1m ago",
    destinationUrl: "https://example.com/product/monitor",
    badge: "Web Agent",
  },
];

export const externalAgenticSearchService = {
  async *search(_query: string): AsyncGenerator<SearchEvent> {
    const stages = [
      "Initializing search agents...",
      "Analyzing query intent...",
      "Expanding semantic categories...",
      "Scraping web sources...",
      "Ranking source authority...",
      "Filtering by Fitness Persona...",
      "Synthesizing recommendations...",
      "Finalizing response...",
    ];
    for (const stage of stages) {
      await wait(320);
      yield { type: "log", message: stage };
    }
    await wait(280);
    yield { type: "result", results: externalResults };
  },
};
