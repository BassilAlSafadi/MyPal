import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMockStore } from '@/lib/useMockStore';
import type { ListingStatus } from '@/mock/listings';
import { 
  ArrowLeft, Plus, Package, Eye, Calendar, MoreVertical,
  Pencil, Trash2, CheckCircle, Clock, XCircle, Archive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import BottomNav from '@/components/BottomNav';

type TabValue = 'active' | 'sold' | 'draft' | 'expired';

const tabs: { value: TabValue; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'sold', label: 'Sold' },
  { value: 'draft', label: 'Drafts' },
  { value: 'expired', label: 'Expired' },
];

const statusConfig: Record<ListingStatus, { icon: typeof CheckCircle; color: string; label: string }> = {
  active: { icon: CheckCircle, color: 'text-green-500', label: 'Active' },
  sold: { icon: CheckCircle, color: 'text-cobalt-light', label: 'Sold' },
  draft: { icon: Clock, color: 'text-muted-foreground', label: 'Draft' },
  expired: { icon: XCircle, color: 'text-destructive', label: 'Expired' },
};

const MyListingsScreen = () => {
  const navigate = useNavigate();
  const { listings, deleteListing } = useMockStore();
  const [activeTab, setActiveTab] = useState<TabValue>('active');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredListings = listings.filter(l => l.status === activeTab);

  const handleDelete = () => {
    if (deleteId) {
      deleteListing(deleteId);
      setDeleteId(null);
    }
  };

  const getEmptyState = () => {
    switch (activeTab) {
      case 'active':
        return { icon: Package, title: 'No active listings', subtitle: 'Create a listing to start selling' };
      case 'sold':
        return { icon: CheckCircle, title: 'No sold items yet', subtitle: 'Your sold items will appear here' };
      case 'draft':
        return { icon: Clock, title: 'No drafts', subtitle: 'Unfinished listings will be saved here' };
      case 'expired':
        return { icon: Archive, title: 'No expired listings', subtitle: 'Expired listings will appear here' };
    }
  };

  const emptyState = getEmptyState();

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 sticky top-0 bg-background z-30 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-lg font-serif font-bold text-foreground">My Listings</h1>
          </div>
          <Button 
            size="sm" 
            onClick={() => navigate('/sell')}
            className="bg-gradient-cobalt gap-1"
          >
            <Plus className="w-4 h-4" /> New
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 glass-card">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.value
                  ? "bg-gradient-cobalt text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        {filteredListings.length === 0 ? (
          <div className="text-center py-12">
            <emptyState.icon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">{emptyState.title}</h3>
            <p className="text-sm text-muted-foreground mb-4">{emptyState.subtitle}</p>
            {activeTab === 'active' && (
              <Button onClick={() => navigate('/sell')} className="bg-gradient-cobalt">
                <Plus className="w-4 h-4 mr-2" /> Create Listing
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredListings.map((listing) => {
              const statusInfo = statusConfig[listing.status];
              const StatusIcon = statusInfo.icon;
              
              return (
                <div key={listing.id} className="glass-card p-3 flex gap-3">
                  {/* Thumbnail */}
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
                    {listing.images[0] ? (
                      <img 
                        src={listing.images[0]} 
                        alt={listing.title} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium text-foreground line-clamp-2">
                        {listing.title}
                      </h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 -m-1">
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2">
                            <Pencil className="w-4 h-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="gap-2 text-destructive"
                            onClick={() => setDeleteId(listing.id)}
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <p className="text-lg font-bold text-foreground mt-1">
                      ${listing.price}
                    </p>

                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className={cn("flex items-center gap-1", statusInfo.color)}>
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {listing.views} views
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {listing.createdAt}
                      </span>
                    </div>

                    {listing.status === 'sold' && listing.buyerName && (
                      <p className="text-xs text-cobalt-light mt-1">
                        Sold to {listing.buyerName}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Listing</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this listing? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BottomNav />
    </div>
  );
};

export default MyListingsScreen;
