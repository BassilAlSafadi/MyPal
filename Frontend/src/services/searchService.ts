// Mock Search Service for Layer 1 refactor
export const searchService = {
  performInternalSearch: async (query: string) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return [
      { id: 'm1', title: 'Refurbished AirPods Max', price: 349, image: 'https://images.unsplash.com/photo-1625245488600-f03fef636a3c?w=300&h=300&fit=crop', source: 'marketplace', seller: 'TechDeals_NYC', rating: 4.3 },
      { id: 'm2', title: 'Custom Mechanical Keyboard', price: 185, image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300&h=300&fit=crop', source: 'marketplace', seller: 'KeyCraft_Studio', rating: 4.9 },
    ];
  },
  
  performGlobalAgenticSearch: async (query: string, onProgress: (log: string) => void) => {
    onProgress("Analyzing query intent...");
    await new Promise((resolve) => setTimeout(resolve, 600));
    
    onProgress("Scraping web sources...");
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    onProgress("Filtering by user persona...");
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    onProgress("Ranking results...");
    await new Promise((resolve) => setTimeout(resolve, 700));
    
    onProgress("Finalizing recommendations...");
    await new Promise((resolve) => setTimeout(resolve, 400));

    return [
      { id: 'e1', title: 'MacBook Pro 14" M4 Pro', price: 1999, image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300&h=300&fit=crop', source: 'external', seller: 'Amazon', rating: 4.8, url: 'https://amazon.com' },
      { id: 'e2', title: 'Samsung Galaxy S25 Ultra', price: 1299, image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300&h=300&fit=crop', source: 'external', seller: 'Best Buy', rating: 4.7, url: 'https://bestbuy.com' },
    ];
  },
};
