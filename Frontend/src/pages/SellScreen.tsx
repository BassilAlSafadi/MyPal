import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMockStore } from '@/lib/useMockStore';
import { mockUser, getTrustBadgeConfig, checkSourceVerification } from '@/mock/user';
import { categories, conditions } from '@/mock/products';
import { 
  ArrowLeft, ArrowRight, Upload, X, Play, Image as ImageIcon, 
  Check, Plus, Trash2, GripVertical, ShieldCheck, AlertCircle,
  DollarSign, Clock, Tag, Package, Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ListingType = 'fixed' | 'auction' | 'offer';

interface MediaFile {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'video';
}

interface SpecRow {
  key: string;
  value: string;
}

const STEPS = ['Media', 'Details', 'Pricing', 'Review'];

const shippingOptions = [
  { value: 'seller-ships', label: 'Seller Ships', icon: Truck },
  { value: 'buyer-arranges', label: 'Buyer Arranges', icon: Package },
  { value: 'local-pickup', label: 'Local Pickup Only', icon: Package },
  { value: 'free-shipping', label: 'Free Shipping', icon: Truck },
];

const categorySpecs: Record<string, string[]> = {
  'Electronics': ['Brand', 'Model', 'Storage', 'RAM', 'Screen Size', 'Battery'],
  'Fashion': ['Brand', 'Size', 'Color', 'Material', 'Style'],
  'Home & Garden': ['Brand', 'Dimensions', 'Material', 'Color', 'Weight'],
  'Sports & Outdoors': ['Brand', 'Size', 'Material', 'Sport Type'],
  'Vehicles & Parts': ['Make', 'Model', 'Year', 'Mileage', 'Condition'],
};

const SellScreen = () => {
  const navigate = useNavigate();
  const { addListing } = useMockStore();
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Media
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaError, setMediaError] = useState('');

  // Step 2: Details
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [description, setDescription] = useState('');
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');

  // Step 3: Pricing
  const [listingType, setListingType] = useState<ListingType>('fixed');
  const [price, setPrice] = useState('');
  const [wasPrice, setWasPrice] = useState('');
  const [startingBid, setStartingBid] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [auctionDuration, setAuctionDuration] = useState('7');
  const [minOffer, setMinOffer] = useState('');
  const [selectedShipping, setSelectedShipping] = useState<string[]>(['seller-ships']);
  const [quantity, setQuantity] = useState(1);

  const hasPhoto = mediaFiles.some(f => f.type === 'image');

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 10 - mediaFiles.length;
    
    if (files.length > remaining) {
      setMediaError(`Can only add ${remaining} more files`);
      return;
    }

    const newFiles: MediaFile[] = files.slice(0, remaining).map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
    }));

    setMediaFiles(prev => [...prev, ...newFiles]);
    setMediaError('');
    e.target.value = '';
  }, [mediaFiles.length]);

  const removeFile = (id: string) => {
    setMediaFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const addSpec = () => {
    if (specs.length < 20) {
      setSpecs([...specs, { key: '', value: '' }]);
    }
  };

  const updateSpec = (index: number, field: 'key' | 'value', value: string) => {
    const newSpecs = [...specs];
    newSpecs[index][field] = value;
    setSpecs(newSpecs);
  };

  const removeSpec = (index: number) => {
    setSpecs(specs.filter((_, i) => i !== index));
  };

  const sourceVerification = sourceUrl ? checkSourceVerification(sourceUrl) : null;

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return hasPhoto;
      case 1:
        return title.length >= 3 && category && condition && description.length >= 30;
      case 2:
        if (listingType === 'fixed') return price && parseFloat(price) > 0;
        if (listingType === 'auction') return startingBid && parseFloat(startingBid) > 0;
        if (listingType === 'offer') return price && parseFloat(price) > 0;
        return false;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate(-1);
    }
  };

  const handlePublish = () => {
    const listing = {
      title,
      description,
      category,
      condition,
      price: parseFloat(price) || parseFloat(startingBid) || 0,
      originalPrice: wasPrice ? parseFloat(wasPrice) : undefined,
      listingType,
      images: mediaFiles.filter(f => f.type === 'image').map(f => f.preview),
      status: 'active' as const,
      specs: specs.reduce((acc, s) => s.key && s.value ? { ...acc, [s.key]: s.value } : acc, {}),
      shippingOptions: selectedShipping,
      quantity,
      ...(listingType === 'auction' && {
        currentBid: parseFloat(startingBid),
        reservePrice: reservePrice ? parseFloat(reservePrice) : undefined,
        auctionEndDate: new Date(Date.now() + parseInt(auctionDuration) * 24 * 60 * 60 * 1000).toISOString(),
      }),
      ...(listingType === 'offer' && {
        minAcceptableOffer: minOffer ? parseFloat(minOffer) : undefined,
      }),
    };

    addListing(listing);
    toast.success('Listing published successfully!');
    navigate('/my-listings');
  };

  const trustBadge = getTrustBadgeConfig(mockUser.trustTier);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Upload Media</h2>
            <p className="text-sm text-muted-foreground">
              Add up to 10 photos and videos. At least 1 photo is required.
            </p>

            {/* Upload Zone */}
            <label className="block cursor-pointer">
              <div className="glass-card p-8 border-2 border-dashed border-border hover:border-cobalt-light transition-colors text-center">
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  Drag and drop or tap to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, WEBP, MP4, MOV
                </p>
              </div>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>

            {/* Counter */}
            <p className={cn(
              "text-sm",
              hasPhoto ? "text-muted-foreground" : "text-destructive"
            )}>
              {mediaFiles.length} / 10 files added
              {!hasPhoto && " - at least 1 photo required"}
            </p>

            {mediaError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {mediaError}
              </p>
            )}

            {/* Preview Grid */}
            {mediaFiles.length > 0 && (
              <div className="grid grid-cols-5 gap-2">
                {mediaFiles.map((file, index) => (
                  <div
                    key={file.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-secondary group"
                  >
                    {file.type === 'video' ? (
                      <>
                        <video src={file.preview} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-6 h-6 text-white" />
                        </div>
                      </>
                    ) : (
                      <img src={file.preview} alt="" className="w-full h-full object-cover" />
                    )}
                    
                    {index === 0 && file.type === 'image' && (
                      <span className="absolute top-1 left-1 text-[8px] px-1.5 py-0.5 bg-cobalt-light text-primary-foreground rounded">
                        Cover
                      </span>
                    )}
                    
                    <button
                      onClick={() => removeFile(file.id)}
                      className="absolute top-1 right-1 w-5 h-5 bg-destructive/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Product Details</h2>

            {/* Title */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Title *</label>
                <span className="text-xs text-muted-foreground">{title.length}/80</span>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                placeholder="What are you selling?"
                className="bg-transparent"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Category *</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Condition */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Condition *</label>
              <div className="grid grid-cols-1 gap-2">
                {conditions.map((cond) => (
                  <button
                    key={cond.value}
                    onClick={() => setCondition(cond.value)}
                    className={cn(
                      "glass-card p-3 text-left transition-all",
                      condition === cond.value && "border-cobalt-light"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        condition === cond.value 
                          ? "border-cobalt-light bg-cobalt-light" 
                          : "border-muted-foreground"
                      )}>
                        {condition === cond.value && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <span className="text-sm font-medium text-foreground">{cond.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">{cond.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Description *</label>
                <span className="text-xs text-muted-foreground">{description.length}/2000</span>
              </div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                placeholder="Describe your item in detail (min 30 characters)"
                rows={4}
                className="bg-transparent resize-none"
              />
              {description.length > 0 && description.length < 30 && (
                <p className="text-xs text-destructive">{30 - description.length} more characters needed</p>
              )}
            </div>

            {/* Specs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Specifications</label>
                <span className="text-xs text-muted-foreground">{specs.length}/20</span>
              </div>
              
              {category && categorySpecs[category] && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {categorySpecs[category].map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        if (!specs.find(s => s.key === suggestion)) {
                          setSpecs([...specs, { key: suggestion, value: '' }]);
                        }
                      }}
                      className="text-xs px-2 py-1 bg-cobalt-light/10 text-cobalt-light rounded-full"
                    >
                      + {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {specs.map((spec, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={spec.key}
                    onChange={(e) => updateSpec(i, 'key', e.target.value)}
                    placeholder="Spec name"
                    className="flex-1 bg-transparent"
                  />
                  <Input
                    value={spec.value}
                    onChange={(e) => updateSpec(i, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 bg-transparent"
                  />
                  <button onClick={() => removeSpec(i)} className="text-destructive p-2">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {specs.length < 20 && (
                <Button variant="outline" size="sm" onClick={addSpec} className="gap-1">
                  <Plus className="w-4 h-4" /> Add Spec
                </Button>
              )}
            </div>

            {/* Source URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Source URL (optional)</label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://amazon.com/..."
                className="bg-transparent"
              />
              {sourceVerification && (
                <div className={cn(
                  "flex items-center gap-2 text-xs px-2 py-1 rounded",
                  sourceVerification.verified 
                    ? "bg-green-500/10 text-green-500" 
                    : "bg-yellow-500/10 text-yellow-500"
                )}>
                  {sourceVerification.verified ? (
                    <>
                      <ShieldCheck className="w-3 h-3" />
                      Verified Source: {sourceVerification.name}
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      Unverified Source
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Pricing & Listing Type</h2>

            {/* Listing Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Listing Type</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'fixed', label: 'Fixed Price', icon: Tag },
                  { value: 'auction', label: 'Auction', icon: Clock },
                  { value: 'offer', label: 'Make Offer', icon: DollarSign },
                ].map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setListingType(type.value as ListingType)}
                      className={cn(
                        "glass-card p-3 flex flex-col items-center gap-2 transition-all",
                        listingType === type.value && "border-cobalt-light"
                      )}
                    >
                      <Icon className={cn(
                        "w-5 h-5",
                        listingType === type.value ? "text-cobalt-light" : "text-muted-foreground"
                      )} />
                      <span className="text-xs font-medium text-foreground">{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price inputs based on type */}
            {listingType === 'fixed' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Price *</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      className="pl-9 bg-transparent"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Original Price (optional)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={wasPrice}
                      onChange={(e) => setWasPrice(e.target.value)}
                      placeholder="0.00"
                      className="pl-9 bg-transparent"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Show crossed-out price for discounts</p>
                </div>
              </div>
            )}

            {listingType === 'auction' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Starting Bid *</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={startingBid}
                      onChange={(e) => setStartingBid(e.target.value)}
                      placeholder="0.00"
                      className="pl-9 bg-transparent"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Duration</label>
                  <Select value={auctionDuration} onValueChange={setAuctionDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 3, 5, 7, 10].map(d => (
                        <SelectItem key={d} value={d.toString()}>{d} days</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Reserve Price (optional)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={reservePrice}
                      onChange={(e) => setReservePrice(e.target.value)}
                      placeholder="0.00"
                      className="pl-9 bg-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {listingType === 'offer' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Suggested Price *</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      className="pl-9 bg-transparent"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Minimum Acceptable Offer</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={minOffer}
                      onChange={(e) => setMinOffer(e.target.value)}
                      placeholder="0.00"
                      className="pl-9 bg-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Shipping */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Shipping Options</label>
              <div className="space-y-2">
                {shippingOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                      <Checkbox
                        checked={selectedShipping.includes(opt.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedShipping([...selectedShipping, opt.value]);
                          } else {
                            setSelectedShipping(selectedShipping.filter(s => s !== opt.value));
                          }
                        }}
                      />
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Quantity</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 glass-card flex items-center justify-center"
                >
                  -
                </button>
                <span className="text-lg font-medium text-foreground w-12 text-center">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 glass-card flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Review & Publish</h2>

            {/* Summary Card */}
            <div className="glass-card p-4 space-y-4">
              {/* Cover Image */}
              {mediaFiles[0] && (
                <div className="aspect-video rounded-lg overflow-hidden bg-secondary">
                  {mediaFiles[0].type === 'video' ? (
                    <video src={mediaFiles[0].preview} className="w-full h-full object-cover" />
                  ) : (
                    <img src={mediaFiles[0].preview} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              )}

              {/* Details */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  <button onClick={() => setCurrentStep(1)} className="text-xs text-cobalt-light">Edit</button>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-secondary rounded text-muted-foreground">{category}</span>
                  <span className="px-2 py-0.5 bg-secondary rounded text-muted-foreground capitalize">{condition}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
              </div>

              {/* Price */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    ${listingType === 'auction' ? startingBid : price}
                  </p>
                  {wasPrice && (
                    <p className="text-sm text-muted-foreground line-through">${wasPrice}</p>
                  )}
                </div>
                <button onClick={() => setCurrentStep(2)} className="text-xs text-cobalt-light">Edit</button>
              </div>
            </div>

            {/* Trust Score */}
            <div className="glass-card p-4">
              <p className="text-sm text-muted-foreground mb-2">Your Trust Score</p>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-sm px-2 py-1 rounded-full font-medium",
                  trustBadge.color
                )}>
                  {trustBadge.label}
                </span>
                <span className="text-lg font-bold text-foreground">{mockUser.trustScore}/100</span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 sticky top-0 bg-background z-30 border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={handleBack}>
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-lg font-serif font-bold text-foreground">Sell Product</h1>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((step, i) => (
              <span 
                key={step}
                className={cn(i <= currentStep && "text-cobalt-light font-medium")}
              >
                {step}
              </span>
            ))}
          </div>
          <Progress value={(currentStep + 1) / STEPS.length * 100} className="h-1" />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        {renderStep()}
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <div className="flex gap-3 max-w-lg mx-auto">
          {currentStep > 0 && (
            <Button variant="outline" onClick={handleBack} className="flex-1">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          )}
          {currentStep < STEPS.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex-1 bg-gradient-cobalt"
            >
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handlePublish}
              className="flex-1 bg-gradient-cobalt"
            >
              Publish Listing
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SellScreen;
