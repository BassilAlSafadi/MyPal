import { internalSearchService } from "./internalSearchService";
import { externalAgenticSearchService } from "./externalAgenticSearchService";

// Adapter boundary to preserve backend contracts while evolving frontend orchestration.
export const searchService = {
  searchInternal: internalSearchService.search,
  searchGlobal: externalAgenticSearchService.search,
};
