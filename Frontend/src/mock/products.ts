export interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  category: string;
  condition: 'new' | 'like-new' | 'good' | 'fair' | 'for-parts';
  rating: number;
  reviewCount: number;
  image: string;
  seller: {
    name: string;
    isMyPal: boolean;
    trustScore?: number;
    trustTier?: 'new' | 'rising' | 'trusted' | 'top' | 'elite';
  };
  freeShipping: boolean;
  brand?: string;
  description: string;
  specs?: Record<string, string>;
}

export const categories = [
  'Electronics',
  'Fashion',
  'Home & Garden',
  'Sports & Outdoors',
  'Books & Media',
  'Vehicles & Parts',
  'Collectibles & Art',
  'Services',
] as const;

export const conditions = [
  { value: 'new', label: 'New', description: 'Brand new, unused, unopened' },
  { value: 'like-new', label: 'Like New', description: 'Opened but never used, perfect condition' },
  { value: 'good', label: 'Good', description: 'Minor signs of wear, fully functional' },
  { value: 'fair', label: 'Fair', description: 'Noticeable wear, works as expected' },
  { value: 'for-parts', label: 'For Parts', description: 'May not be fully functional' },
] as const;

export const brands = [
  'Apple', 'Samsung', 'Sony', 'Nike', 'Adidas', 'Dell', 'HP', 'LG', 
  'Bose', 'JBL', 'Canon', 'Nikon', 'Nintendo', 'Microsoft', 'Google',
  'Dyson', 'Philips', 'Panasonic', 'Lenovo', 'ASUS'
];

export const mockProducts: Product[] = [
  {
    id: '1',
    title: 'iPhone 15 Pro Max 256GB - Natural Titanium',
    price: 1099,
    originalPrice: 1199,
    category: 'Electronics',
    condition: 'new',
    rating: 4.8,
    reviewCount: 2341,
    image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&h=400&fit=crop',
    seller: { name: 'TechZone', isMyPal: true, trustScore: 95, trustTier: 'elite' },
    freeShipping: true,
    brand: 'Apple',
    description: 'The most powerful iPhone ever with A17 Pro chip and titanium design.',
    specs: { 'Storage': '256GB', 'Color': 'Natural Titanium', 'Display': '6.7" Super Retina XDR' }
  },
  {
    id: '2',
    title: 'Samsung Galaxy S24 Ultra 512GB',
    price: 1199,
    category: 'Electronics',
    condition: 'new',
    rating: 4.7,
    reviewCount: 1892,
    image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400&h=400&fit=crop',
    seller: { name: 'MobileHub', isMyPal: true, trustScore: 88, trustTier: 'top' },
    freeShipping: true,
    brand: 'Samsung',
    description: 'Galaxy AI is here. The ultimate smartphone with S Pen.',
    specs: { 'Storage': '512GB', 'RAM': '12GB', 'Display': '6.8" Dynamic AMOLED 2X' }
  },
  {
    id: '3',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    price: 348,
    originalPrice: 399,
    category: 'Electronics',
    condition: 'new',
    rating: 4.9,
    reviewCount: 5621,
    image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&h=400&fit=crop',
    seller: { name: 'AudioWorld', isMyPal: false },
    freeShipping: true,
    brand: 'Sony',
    description: 'Industry-leading noise cancellation with exceptional sound quality.',
    specs: { 'Battery': '30 hours', 'Driver': '30mm', 'Weight': '250g' }
  },
  {
    id: '4',
    title: 'MacBook Pro 14" M3 Pro - Space Black',
    price: 1999,
    category: 'Electronics',
    condition: 'new',
    rating: 4.9,
    reviewCount: 1234,
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=400&fit=crop',
    seller: { name: 'Apple Direct', isMyPal: false },
    freeShipping: true,
    brand: 'Apple',
    description: 'Supercharged for pros. Up to 18 hours of battery life.',
    specs: { 'Chip': 'M3 Pro', 'RAM': '18GB', 'Storage': '512GB SSD' }
  },
  {
    id: '5',
    title: 'Nike Air Max 90 - Triple White',
    price: 130,
    category: 'Fashion',
    condition: 'new',
    rating: 4.6,
    reviewCount: 3421,
    image: 'https://images.unsplash.com/photo-1514989940723-e8e51d675571?w=400&h=400&fit=crop',
    seller: { name: 'SneakerVault', isMyPal: true, trustScore: 76, trustTier: 'trusted' },
    freeShipping: false,
    brand: 'Nike',
    description: 'Nothing as icons as icons get, the iconic Air Max 90.',
    specs: { 'Material': 'Leather/Mesh', 'Sole': 'Air Max cushioning' }
  },
  {
    id: '6',
    title: 'Dyson V15 Detect Cordless Vacuum',
    price: 649,
    originalPrice: 749,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.7,
    reviewCount: 2156,
    image: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=400&h=400&fit=crop',
    seller: { name: 'HomeEssentials', isMyPal: true, trustScore: 82, trustTier: 'top' },
    freeShipping: true,
    brand: 'Dyson',
    description: 'Reveals hidden dust with a laser. Intelligently adapts suction.',
    specs: { 'Runtime': '60 min', 'Bin': '0.76L', 'Weight': '6.8 lbs' }
  },
  {
    id: '7',
    title: 'PlayStation 5 Console - Disc Edition',
    price: 499,
    category: 'Electronics',
    condition: 'new',
    rating: 4.8,
    reviewCount: 8934,
    image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=400&fit=crop',
    seller: { name: 'GameStop', isMyPal: false },
    freeShipping: true,
    brand: 'Sony',
    description: 'Experience lightning-fast loading with an ultra-high-speed SSD.',
    specs: { 'Storage': '825GB SSD', 'Resolution': 'Up to 4K 120Hz' }
  },
  {
    id: '8',
    title: 'Nintendo Switch OLED Model',
    price: 349,
    category: 'Electronics',
    condition: 'new',
    rating: 4.8,
    reviewCount: 6721,
    image: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=400&h=400&fit=crop',
    seller: { name: 'GameZone', isMyPal: true, trustScore: 91, trustTier: 'top' },
    freeShipping: true,
    brand: 'Nintendo',
    description: '7-inch OLED screen with vibrant colors and enhanced audio.',
    specs: { 'Screen': '7" OLED', 'Storage': '64GB', 'Battery': '4.5-9 hours' }
  },
  {
    id: '9',
    title: 'Adidas Ultraboost 22 Running Shoes',
    price: 190,
    originalPrice: 220,
    category: 'Sports & Outdoors',
    condition: 'new',
    rating: 4.5,
    reviewCount: 2341,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
    seller: { name: 'RunnerWorld', isMyPal: false },
    freeShipping: false,
    brand: 'Adidas',
    description: 'Responsive Boost midsole and Primeknit+ upper.',
    specs: { 'Material': 'Primeknit+', 'Midsole': 'Boost', 'Weight': '310g' }
  },
  {
    id: '10',
    title: 'Canon EOS R6 Mark II Mirrorless Camera',
    price: 2499,
    category: 'Electronics',
    condition: 'new',
    rating: 4.9,
    reviewCount: 892,
    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=400&fit=crop',
    seller: { name: 'CameraWorld', isMyPal: true, trustScore: 94, trustTier: 'elite' },
    freeShipping: true,
    brand: 'Canon',
    description: '24.2MP Full-Frame sensor with 40fps continuous shooting.',
    specs: { 'Sensor': '24.2MP Full-Frame', 'ISO': '100-102400', 'Video': '4K 60p' }
  },
  {
    id: '11',
    title: 'Vintage Leather Messenger Bag',
    price: 89,
    originalPrice: 129,
    category: 'Fashion',
    condition: 'new',
    rating: 4.4,
    reviewCount: 567,
    image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&h=400&fit=crop',
    seller: { name: 'LeatherCraft', isMyPal: true, trustScore: 68, trustTier: 'trusted' },
    freeShipping: false,
    description: 'Handcrafted genuine leather messenger bag with brass hardware.',
    specs: { 'Material': 'Full-grain leather', 'Size': '15" laptop compatible' }
  },
  {
    id: '12',
    title: 'Bose SoundLink Flex Bluetooth Speaker',
    price: 149,
    category: 'Electronics',
    condition: 'new',
    rating: 4.6,
    reviewCount: 3421,
    image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop',
    seller: { name: 'SoundShop', isMyPal: false },
    freeShipping: true,
    brand: 'Bose',
    description: 'Portable Bluetooth speaker with deep, clear, immersive sound.',
    specs: { 'Battery': '12 hours', 'Waterproof': 'IP67', 'Weight': '590g' }
  },
  {
    id: '13',
    title: 'Apple Watch Series 9 GPS 45mm',
    price: 429,
    category: 'Electronics',
    condition: 'new',
    rating: 4.8,
    reviewCount: 4521,
    image: 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=400&h=400&fit=crop',
    seller: { name: 'WatchWorld', isMyPal: true, trustScore: 87, trustTier: 'top' },
    freeShipping: true,
    brand: 'Apple',
    description: 'The ultimate fitness partner with Double Tap gesture.',
    specs: { 'Display': '45mm Retina', 'Chip': 'S9 SiP', 'Water': '50m resistant' }
  },
  {
    id: '14',
    title: 'IKEA MALM Bed Frame Queen',
    price: 249,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.3,
    reviewCount: 8932,
    image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=400&h=400&fit=crop',
    seller: { name: 'IKEA', isMyPal: false },
    freeShipping: false,
    description: 'Clean design with veneer. High bed frame with storage boxes.',
    specs: { 'Size': 'Queen', 'Material': 'Particleboard', 'Color': 'White' }
  },
  {
    id: '15',
    title: 'Refurbished iPad Pro 12.9" M2 128GB',
    price: 799,
    originalPrice: 1099,
    category: 'Electronics',
    condition: 'like-new',
    rating: 4.7,
    reviewCount: 234,
    image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&h=400&fit=crop',
    seller: { name: 'RefurbTech', isMyPal: true, trustScore: 72, trustTier: 'trusted' },
    freeShipping: true,
    brand: 'Apple',
    description: 'Certified refurbished iPad Pro with 90-day warranty.',
    specs: { 'Chip': 'M2', 'Storage': '128GB', 'Display': '12.9" Liquid Retina XDR' }
  },
  {
    id: '16',
    title: 'Vintage 1960s Rolex Submariner',
    price: 15999,
    category: 'Collectibles & Art',
    condition: 'good',
    rating: 5.0,
    reviewCount: 12,
    image: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400&h=400&fit=crop',
    seller: { name: 'LuxuryVintage', isMyPal: true, trustScore: 98, trustTier: 'elite' },
    freeShipping: true,
    description: 'Authentic vintage Submariner ref. 5513 with original patina.',
    specs: { 'Year': '1968', 'Reference': '5513', 'Dial': 'Matte Black' }
  },
  {
    id: '17',
    title: 'Herman Miller Aeron Chair Size B',
    price: 1395,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.9,
    reviewCount: 3421,
    image: 'https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=400&h=400&fit=crop',
    seller: { name: 'OfficeDesign', isMyPal: false },
    freeShipping: true,
    description: 'Iconic ergonomic office chair with 12-year warranty.',
    specs: { 'Size': 'B (Medium)', 'Material': 'Pellicle mesh', 'Warranty': '12 years' }
  },
  {
    id: '18',
    title: 'JBL Charge 5 Portable Speaker',
    price: 179,
    originalPrice: 199,
    category: 'Electronics',
    condition: 'new',
    rating: 4.7,
    reviewCount: 5621,
    image: 'https://images.unsplash.com/photo-1589003077984-894e133dabab?w=400&h=400&fit=crop',
    seller: { name: 'AudioMax', isMyPal: true, trustScore: 79, trustTier: 'trusted' },
    freeShipping: true,
    brand: 'JBL',
    description: 'Powerful sound with 20 hours of playtime and built-in powerbank.',
    specs: { 'Battery': '20 hours', 'Waterproof': 'IP67', 'Driver': 'Dual passive radiators' }
  },
  {
    id: '19',
    title: 'Levi\'s 501 Original Fit Jeans',
    price: 69,
    category: 'Fashion',
    condition: 'new',
    rating: 4.5,
    reviewCount: 12341,
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop',
    seller: { name: 'DenimHouse', isMyPal: false },
    freeShipping: false,
    brand: 'Levi\'s',
    description: 'The original jean since 1873. Straight leg, button fly.',
    specs: { 'Fit': 'Original', 'Rise': 'Regular', 'Material': '100% Cotton' }
  },
  {
    id: '20',
    title: 'Specialized Turbo Levo E-Bike',
    price: 5999,
    category: 'Vehicles & Parts',
    condition: 'new',
    rating: 4.8,
    reviewCount: 234,
    image: 'https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=400&h=400&fit=crop',
    seller: { name: 'BikeShop Pro', isMyPal: true, trustScore: 91, trustTier: 'top' },
    freeShipping: false,
    brand: 'Specialized',
    description: 'Full suspension e-MTB with custom Turbo Full Power System 2.2.',
    specs: { 'Motor': '250W', 'Battery': '700Wh', 'Frame': 'Carbon' }
  },
  {
    id: '21',
    title: 'Dell XPS 15 Laptop - i7/32GB/1TB',
    price: 1699,
    originalPrice: 1999,
    category: 'Electronics',
    condition: 'new',
    rating: 4.6,
    reviewCount: 2341,
    image: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=400&h=400&fit=crop',
    seller: { name: 'Dell Direct', isMyPal: false },
    freeShipping: true,
    brand: 'Dell',
    description: '15.6" OLED 3.5K display with 13th Gen Intel Core.',
    specs: { 'CPU': 'i7-13700H', 'RAM': '32GB', 'Storage': '1TB SSD' }
  },
  {
    id: '22',
    title: 'Ray-Ban Aviator Classic Sunglasses',
    price: 163,
    category: 'Fashion',
    condition: 'new',
    rating: 4.7,
    reviewCount: 8932,
    image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&h=400&fit=crop',
    seller: { name: 'SunglassHut', isMyPal: false },
    freeShipping: false,
    brand: 'Ray-Ban',
    description: 'The iconic Aviator in gold frame with green G-15 lenses.',
    specs: { 'Frame': 'Gold Metal', 'Lens': 'G-15 Green', 'Size': '58mm' }
  },
  {
    id: '23',
    title: 'KitchenAid Artisan Stand Mixer 5qt',
    price: 449,
    originalPrice: 499,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.9,
    reviewCount: 15621,
    image: 'https://images.unsplash.com/photo-1594385208974-2e75f8d7bb48?w=400&h=400&fit=crop',
    seller: { name: 'KitchenPro', isMyPal: true, trustScore: 85, trustTier: 'top' },
    freeShipping: true,
    brand: 'KitchenAid',
    description: 'Tilt-head stand mixer with 10+ attachments available.',
    specs: { 'Capacity': '5 Quart', 'Power': '325W', 'Speeds': '10' }
  },
  {
    id: '24',
    title: 'First Edition Harry Potter Box Set',
    price: 2499,
    category: 'Books & Media',
    condition: 'good',
    rating: 5.0,
    reviewCount: 45,
    image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&h=400&fit=crop',
    seller: { name: 'RareBooks', isMyPal: true, trustScore: 96, trustTier: 'elite' },
    freeShipping: true,
    description: 'UK first edition hardcover set, all seven books.',
    specs: { 'Edition': 'First UK', 'Condition': 'Very Good', 'Year': '1997-2007' }
  },
  {
    id: '25',
    title: 'Concept2 Model D Rowing Machine',
    price: 990,
    category: 'Sports & Outdoors',
    condition: 'new',
    rating: 4.9,
    reviewCount: 4521,
    image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=400&fit=crop',
    seller: { name: 'FitGear', isMyPal: true, trustScore: 88, trustTier: 'top' },
    freeShipping: false,
    brand: 'Concept2',
    description: 'The gold standard of rowing machines with PM5 monitor.',
    specs: { 'Monitor': 'PM5', 'Resistance': 'Air', 'Warranty': '5 years' }
  },
  {
    id: '26',
    title: 'Panasonic Lumix GH6 Camera Body',
    price: 1799,
    originalPrice: 2199,
    category: 'Electronics',
    condition: 'new',
    rating: 4.7,
    reviewCount: 432,
    image: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=400&h=400&fit=crop',
    seller: { name: 'ProPhoto', isMyPal: true, trustScore: 83, trustTier: 'top' },
    freeShipping: true,
    brand: 'Panasonic',
    description: 'Mirrorless camera with 5.7K video and image stabilization.',
    specs: { 'Sensor': '25.2MP MFT', 'Video': '5.7K 60p', 'IBIS': '7.5 stops' }
  },
  {
    id: '27',
    title: 'Weber Spirit II E-310 Gas Grill',
    price: 499,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.6,
    reviewCount: 3421,
    image: 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=400&fit=crop',
    seller: { name: 'BBQWorld', isMyPal: false },
    freeShipping: false,
    brand: 'Weber',
    description: '3-burner propane grill with GS4 grilling system.',
    specs: { 'Burners': '3', 'BTU': '30,000', 'Cooking Area': '529 sq in' }
  },
  {
    id: '28',
    title: 'Peloton Bike+ with 24" HD Screen',
    price: 2495,
    category: 'Sports & Outdoors',
    condition: 'new',
    rating: 4.8,
    reviewCount: 6721,
    image: 'https://images.unsplash.com/photo-1591741535018-9c4f5a4d6c46?w=400&h=400&fit=crop',
    seller: { name: 'Peloton', isMyPal: false },
    freeShipping: true,
    brand: 'Peloton',
    description: 'Rotating 24" HD touchscreen with Auto Follow feature.',
    specs: { 'Screen': '24" HD', 'Features': 'Auto Follow', 'Speakers': '26W' }
  },
  {
    id: '29',
    title: 'Vintage Nintendo Game Boy Color',
    price: 149,
    category: 'Collectibles & Art',
    condition: 'good',
    rating: 4.6,
    reviewCount: 234,
    image: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=400&h=400&fit=crop',
    seller: { name: 'RetroGaming', isMyPal: true, trustScore: 74, trustTier: 'trusted' },
    freeShipping: false,
    brand: 'Nintendo',
    description: 'Working Game Boy Color in Atomic Purple. Tested and cleaned.',
    specs: { 'Color': 'Atomic Purple', 'Year': '1998', 'Includes': 'Console only' }
  },
  {
    id: '30',
    title: 'Samsung 65" Neo QLED 4K Smart TV',
    price: 1799,
    originalPrice: 2199,
    category: 'Electronics',
    condition: 'new',
    rating: 4.8,
    reviewCount: 2341,
    image: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400&h=400&fit=crop',
    seller: { name: 'TechMart', isMyPal: true, trustScore: 89, trustTier: 'top' },
    freeShipping: true,
    brand: 'Samsung',
    description: 'Neo QLED with Quantum Matrix Technology and Neural Processor.',
    specs: { 'Size': '65"', 'Resolution': '4K', 'HDR': 'HDR10+' }
  },
  {
    id: '31',
    title: 'Yeti Tundra 45 Hard Cooler',
    price: 325,
    category: 'Sports & Outdoors',
    condition: 'new',
    rating: 4.8,
    reviewCount: 5621,
    image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop',
    seller: { name: 'OutdoorGear', isMyPal: false },
    freeShipping: false,
    brand: 'Yeti',
    description: 'Rotomolded construction keeps ice for days.',
    specs: { 'Capacity': '45 quarts', 'Ice Retention': '10+ days', 'Weight': '23 lbs' }
  },
  {
    id: '32',
    title: 'Theragun Pro Massage Device',
    price: 449,
    originalPrice: 599,
    category: 'Sports & Outdoors',
    condition: 'new',
    rating: 4.7,
    reviewCount: 3421,
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=400&fit=crop',
    seller: { name: 'WellnessHub', isMyPal: true, trustScore: 81, trustTier: 'top' },
    freeShipping: true,
    brand: 'Therabody',
    description: 'Professional-grade percussive therapy device with smart app.',
    specs: { 'Speed': '5 built-in', 'Battery': '300 min', 'Force': '60 lbs' }
  },
  {
    id: '33',
    title: 'LEGO Star Wars Millennium Falcon',
    price: 849,
    category: 'Collectibles & Art',
    condition: 'new',
    rating: 4.9,
    reviewCount: 2341,
    image: 'https://images.unsplash.com/photo-1472457897821-70d3819a0e24?w=400&h=400&fit=crop',
    seller: { name: 'BrickWorld', isMyPal: true, trustScore: 92, trustTier: 'top' },
    freeShipping: true,
    brand: 'LEGO',
    description: 'Ultimate Collector Series with 7,541 pieces.',
    specs: { 'Pieces': '7,541', 'Dimensions': '33" x 22"', 'Minifigs': '4' }
  },
  {
    id: '34',
    title: 'Nespresso Vertuo Next Coffee Machine',
    price: 179,
    originalPrice: 219,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.5,
    reviewCount: 8932,
    image: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=400&h=400&fit=crop',
    seller: { name: 'CoffeeLovers', isMyPal: false },
    freeShipping: true,
    brand: 'Nespresso',
    description: 'Centrifusion technology for 5 cup sizes from espresso to alto.',
    specs: { 'Pressure': '19 bar', 'Sizes': '5', 'Water Tank': '37 oz' }
  },
  {
    id: '35',
    title: 'Refurbished AirPods Pro (2nd Gen)',
    price: 179,
    originalPrice: 249,
    category: 'Electronics',
    condition: 'like-new',
    rating: 4.6,
    reviewCount: 567,
    image: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400&h=400&fit=crop',
    seller: { name: 'RefurbTech', isMyPal: true, trustScore: 72, trustTier: 'trusted' },
    freeShipping: true,
    brand: 'Apple',
    description: 'Certified refurbished with Active Noise Cancellation.',
    specs: { 'ANC': 'Yes', 'Battery': '6 hours', 'Chip': 'H2' }
  },
  {
    id: '36',
    title: 'Patagonia Better Sweater Fleece Jacket',
    price: 139,
    category: 'Fashion',
    condition: 'new',
    rating: 4.7,
    reviewCount: 4521,
    image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=400&fit=crop',
    seller: { name: 'OutdoorApparel', isMyPal: true, trustScore: 77, trustTier: 'trusted' },
    freeShipping: false,
    brand: 'Patagonia',
    description: '100% recycled polyester fleece with Fair Trade Certified sewn.',
    specs: { 'Material': 'Recycled Polyester', 'Weight': '539g', 'Fit': 'Regular' }
  },
  {
    id: '37',
    title: 'LG C3 55" OLED evo 4K Smart TV',
    price: 1299,
    originalPrice: 1499,
    category: 'Electronics',
    condition: 'new',
    rating: 4.9,
    reviewCount: 5621,
    image: 'https://images.unsplash.com/photo-1461151304267-38535e780c79?w=400&h=400&fit=crop',
    seller: { name: 'TVWorld', isMyPal: true, trustScore: 86, trustTier: 'top' },
    freeShipping: true,
    brand: 'LG',
    description: 'OLED evo with Brightness Booster and Dolby Vision.',
    specs: { 'Size': '55"', 'Panel': 'OLED evo', 'Refresh': '120Hz' }
  },
  {
    id: '38',
    title: 'Oral-B iO Series 9 Electric Toothbrush',
    price: 299,
    originalPrice: 379,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.6,
    reviewCount: 3421,
    image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&h=400&fit=crop',
    seller: { name: 'DentalCare', isMyPal: false },
    freeShipping: true,
    brand: 'Oral-B',
    description: 'AI-powered smart coaching with 3D teeth tracking.',
    specs: { 'Modes': '7', 'Battery': '14 days', 'Display': 'Color' }
  },
  {
    id: '39',
    title: 'Secretlab Titan Evo Gaming Chair',
    price: 549,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.8,
    reviewCount: 6721,
    image: 'https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=400&h=400&fit=crop',
    seller: { name: 'GamingSetup', isMyPal: true, trustScore: 84, trustTier: 'top' },
    freeShipping: true,
    brand: 'Secretlab',
    description: 'Multi-tilt mechanism with 4-way L-ADAPT lumbar support.',
    specs: { 'Material': 'NEO Hybrid Leatherette', 'Weight Capacity': '395 lbs', 'Recline': '165°' }
  },
  {
    id: '40',
    title: 'Sonos Arc Premium Soundbar',
    price: 899,
    category: 'Electronics',
    condition: 'new',
    rating: 4.8,
    reviewCount: 4521,
    image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=400&h=400&fit=crop',
    seller: { name: 'AudioElite', isMyPal: true, trustScore: 90, trustTier: 'top' },
    freeShipping: true,
    brand: 'Sonos',
    description: 'Dolby Atmos soundbar with 11 high-performance drivers.',
    specs: { 'Channels': '5.0.2', 'Dolby Atmos': 'Yes', 'Connectivity': 'WiFi, HDMI eARC' }
  },
  {
    id: '41',
    title: 'Professional Logo Design Service',
    price: 299,
    category: 'Services',
    condition: 'new',
    rating: 4.9,
    reviewCount: 234,
    image: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=400&h=400&fit=crop',
    seller: { name: 'DesignStudio', isMyPal: true, trustScore: 93, trustTier: 'elite' },
    freeShipping: true,
    description: '3 unique logo concepts, unlimited revisions, all file formats.',
    specs: { 'Concepts': '3', 'Revisions': 'Unlimited', 'Delivery': '5 days' }
  },
  {
    id: '42',
    title: 'Website Development Package',
    price: 1499,
    category: 'Services',
    condition: 'new',
    rating: 4.8,
    reviewCount: 156,
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop',
    seller: { name: 'WebDevPro', isMyPal: true, trustScore: 89, trustTier: 'top' },
    freeShipping: true,
    description: '5-page responsive website with CMS and SEO optimization.',
    specs: { 'Pages': '5', 'CMS': 'Included', 'Delivery': '2 weeks' }
  },
  {
    id: '43',
    title: 'Used Tesla Model 3 Wheel Set',
    price: 899,
    originalPrice: 1200,
    category: 'Vehicles & Parts',
    condition: 'good',
    rating: 4.5,
    reviewCount: 45,
    image: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=400&h=400&fit=crop',
    seller: { name: 'TeslaParts', isMyPal: true, trustScore: 71, trustTier: 'trusted' },
    freeShipping: false,
    description: '18" Aero Wheels with Continental tires. 80% tread remaining.',
    specs: { 'Size': '18"', 'Tread': '80%', 'Set': '4 wheels + tires' }
  },
  {
    id: '44',
    title: 'Garmin Fenix 7X Solar Smartwatch',
    price: 899,
    category: 'Electronics',
    condition: 'new',
    rating: 4.8,
    reviewCount: 2341,
    image: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=400&h=400&fit=crop',
    seller: { name: 'SportsWatch', isMyPal: false },
    freeShipping: true,
    brand: 'Garmin',
    description: 'Multisport GPS watch with solar charging and maps.',
    specs: { 'Battery': '37 days solar', 'Display': '1.4"', 'Water': '10 ATM' }
  },
  {
    id: '45',
    title: 'Kindle Paperwhite Signature Edition',
    price: 189,
    category: 'Electronics',
    condition: 'new',
    rating: 4.7,
    reviewCount: 8932,
    image: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=400&h=400&fit=crop',
    seller: { name: 'Amazon', isMyPal: false },
    freeShipping: true,
    brand: 'Amazon',
    description: '6.8" display with wireless charging and auto-adjusting light.',
    specs: { 'Storage': '32GB', 'Display': '6.8" 300ppi', 'Battery': '10 weeks' }
  },
  {
    id: '46',
    title: 'Vintage Polaroid SX-70 Camera',
    price: 299,
    category: 'Collectibles & Art',
    condition: 'good',
    rating: 4.6,
    reviewCount: 89,
    image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&h=400&fit=crop',
    seller: { name: 'VintagePhoto', isMyPal: true, trustScore: 78, trustTier: 'trusted' },
    freeShipping: false,
    brand: 'Polaroid',
    description: 'Working SX-70 with original leather case. Recently serviced.',
    specs: { 'Year': '1972', 'Film': 'SX-70/600', 'Condition': 'Tested working' }
  },
  {
    id: '47',
    title: 'Wilson Pro Staff RF97 Tennis Racket',
    price: 269,
    category: 'Sports & Outdoors',
    condition: 'new',
    rating: 4.7,
    reviewCount: 567,
    image: 'https://images.unsplash.com/photo-1617083934555-28d2403d9bcb?w=400&h=400&fit=crop',
    seller: { name: 'TennisPro', isMyPal: true, trustScore: 82, trustTier: 'top' },
    freeShipping: false,
    brand: 'Wilson',
    description: 'Roger Federer\'s signature racket with braided graphite.',
    specs: { 'Head': '97 sq in', 'Weight': '340g', 'String Pattern': '16x19' }
  },
  {
    id: '48',
    title: 'Breville Barista Express Espresso Machine',
    price: 699,
    originalPrice: 799,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.6,
    reviewCount: 6721,
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&h=400&fit=crop',
    seller: { name: 'CoffeeMasters', isMyPal: true, trustScore: 87, trustTier: 'top' },
    freeShipping: true,
    brand: 'Breville',
    description: 'Bean to espresso in under a minute with integrated grinder.',
    specs: { 'Pressure': '15 bar', 'Grinder': 'Built-in conical burr', 'Water Tank': '67 oz' }
  },
  {
    id: '49',
    title: 'ASUS ROG Strix G16 Gaming Laptop',
    price: 1599,
    originalPrice: 1899,
    category: 'Electronics',
    condition: 'new',
    rating: 4.7,
    reviewCount: 1234,
    image: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=400&h=400&fit=crop',
    seller: { name: 'PCGaming', isMyPal: true, trustScore: 85, trustTier: 'top' },
    freeShipping: true,
    brand: 'ASUS',
    description: 'RTX 4070, 16" 165Hz display, Intel Core i9-13980HX.',
    specs: { 'GPU': 'RTX 4070', 'CPU': 'i9-13980HX', 'RAM': '16GB DDR5' }
  },
  {
    id: '50',
    title: 'Stanley Quencher H2.0 Tumbler 40oz',
    price: 45,
    category: 'Home & Garden',
    condition: 'new',
    rating: 4.8,
    reviewCount: 25621,
    image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=400&fit=crop',
    seller: { name: 'DrinkWare', isMyPal: false },
    freeShipping: false,
    brand: 'Stanley',
    description: 'Vacuum insulated tumbler keeps drinks cold for hours.',
    specs: { 'Capacity': '40 oz', 'Insulation': 'Double-wall vacuum', 'Material': 'Stainless Steel' }
  }
];

export const getProductsByCategory = (category: string): Product[] => {
  return mockProducts.filter(p => p.category === category);
};

export const searchProducts = (query: string, filters?: {
  category?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  condition?: string;
  freeShipping?: boolean;
  brand?: string[];
}): Product[] => {
  let results = mockProducts;
  
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(p => 
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q))
    );
  }
  
  if (filters) {
    if (filters.category?.length) {
      results = results.filter(p => filters.category!.includes(p.category));
    }
    if (filters.minPrice !== undefined) {
      results = results.filter(p => p.price >= filters.minPrice!);
    }
    if (filters.maxPrice !== undefined) {
      results = results.filter(p => p.price <= filters.maxPrice!);
    }
    if (filters.minRating !== undefined) {
      results = results.filter(p => p.rating >= filters.minRating!);
    }
    if (filters.condition) {
      results = results.filter(p => p.condition === filters.condition);
    }
    if (filters.freeShipping) {
      results = results.filter(p => p.freeShipping);
    }
    if (filters.brand?.length) {
      results = results.filter(p => p.brand && filters.brand!.includes(p.brand));
    }
  }
  
  return results;
};
