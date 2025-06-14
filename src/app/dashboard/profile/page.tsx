
'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Edit3, Palette, Loader2, User as UserIcon, Users, Camera } from "lucide-react";
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { auth, database } from '@/lib/firebase';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { ref, onValue, update, get, off } from 'firebase/database';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';


interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  avatar: string; 
  banner?: string; 
  bio: string;
  title?: string;
  nameColor?: string;
  isShinyGold?: boolean;
  friendsCount?: number; 
}

const MAX_AVATAR_SIZE_BYTES = 500 * 1024; // 500KB
const MAX_BANNER_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

export default function ProfilePage() {
  const { toast } = useToast();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioEdit, setBioEdit] = useState('');
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setAuthEmail(user.email);
        const userProfileRef = ref(database, 'users/' + user.uid);
        
        const profileListener = onValue(userProfileRef, (profileSnapshot) => {
          const data = profileSnapshot.val();
          if (data) {
            setUserProfile({
              uid: user.uid,
              username: data.username || (user.email?.split('@')[0] || "User"),
              displayName: data.displayName || user.displayName || "User",
              avatar: data.avatar || `https://placehold.co/128x128.png?text=${(data.displayName || user.displayName || "U").substring(0,2).toUpperCase()}`,
              banner: data.banner || "https://placehold.co/1200x300.png?text=Banner",
              bio: data.bio || "No bio yet.",
              title: data.title,
              nameColor: data.nameColor,
              isShinyGold: data.isShinyGold || false,
              friendsCount: data.friendsCount || 0, 
            });
            setBioEdit(data.bio || "");
          } else {
            const fallbackUsername = user.email?.split('@')[0] || "User";
            const basicProfile: UserProfile = {
              uid: user.uid,
              username: fallbackUsername,
              displayName: user.displayName || fallbackUsername,
              avatar: `https://placehold.co/128x128.png?text=${(user.displayName || "U").substring(0,2).toUpperCase()}`,
              banner: "https://placehold.co/1200x300.png?text=Banner",
              bio: "New user! Ready to chat.",
              friendsCount: 0,
              isShinyGold: false,
            };
            setUserProfile(basicProfile);
            setBioEdit(basicProfile.bio);
          }
          setIsLoading(false);
        }, (error) => {
          console.error("Error fetching profile data:", error);
          toast({ title: "Error", description: "Could not fetch profile data.", variant: "destructive"});
          setIsLoading(false);
        });
        
        return () => {
          off(userProfileRef, 'value', profileListener);
        };

      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setAuthEmail(null);
        setIsLoading(false);
        router.push('/auth');
      }
    });
    return () => unsubscribe();
  }, [toast, router]);


  const handleBioEditToggle = () => {
    if (isEditingBio && userProfile && currentUser) {
      const userProfileRef = ref(database, 'users/' + currentUser.uid);
      update(userProfileRef, { bio: bioEdit })
        .then(() => {
          toast({ title: "Success", description: "Bio updated." });
          setUserProfile(prev => prev ? {...prev, bio: bioEdit} : null);
        })
        .catch(error => {
          toast({ title: "Error", description: "Could not update bio.", variant: "destructive" });
        });
    }
    setIsEditingBio(!isEditingBio);
  };

  const handleImageUpload = async (file: File, imageType: 'avatar' | 'banner') => {
    if (!currentUser) {
      toast({ title: "Error", description: "You must be logged in to upload images.", variant: "destructive" });
      return;
    }
    if (!file) return;

    const maxSize = imageType === 'avatar' ? MAX_AVATAR_SIZE_BYTES : MAX_BANNER_SIZE_BYTES;
    if (file.size > maxSize) {
        const limit = imageType === 'avatar' ? '500KB' : '1MB';
        toast({
            title: "File Too Large",
            description: `${imageType === 'avatar' ? 'Avatar' : 'Banner'} image must be less than ${limit}. Please choose a smaller file or resize it.`,
            variant: "destructive",
        });
        if (avatarInputRef.current) avatarInputRef.current.value = ""; 
        if (bannerInputRef.current) bannerInputRef.current.value = ""; 
        return;
    }

    if (imageType === 'avatar') setIsUploadingAvatar(true);
    if (imageType === 'banner') setIsUploadingBanner(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const dataUri = reader.result as string;
      const userProfileRef = ref(database, 'users/' + currentUser.uid);
      try {
        if (imageType === 'avatar') {
          await update(userProfileRef, { avatar: dataUri });
          setUserProfile(prev => prev ? { ...prev, avatar: dataUri } : null);
          toast({ title: "Success", description: "Profile picture updated." });
        } else if (imageType === 'banner') {
          await update(userProfileRef, { banner: dataUri });
          setUserProfile(prev => prev ? { ...prev, banner: dataUri } : null);
          toast({ title: "Success", description: "Banner image updated." });
        }
      } catch (error: any) {
        console.error("Error updating profile with new image Data URI:", error);
        toast({ title: "Update Failed", description: "Could not update profile with new image.", variant: "destructive" });
      } finally {
        if (imageType === 'avatar') setIsUploadingAvatar(false);
        if (imageType === 'banner') setIsUploadingBanner(false);
        if (avatarInputRef.current) avatarInputRef.current.value = "";
        if (bannerInputRef.current) bannerInputRef.current.value = "";
      }
    };
    reader.onerror = (error) => {
      console.error("Error reading file:", error);
      toast({ title: "Upload Failed", description: "Could not read image file.", variant: "destructive" });
      if (imageType === 'avatar') setIsUploadingAvatar(false);
      if (imageType === 'banner') setIsUploadingBanner(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    };
  };

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageUpload(file, 'avatar');
    }
  };

  const handleBannerFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageUpload(file, 'banner');
    }
  };


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser || !userProfile) {
    return (
      <div className="flex flex-col justify-center items-center h-full space-y-4">
        <p className="text-xl">Please log in to view your profile.</p>
        <Button onClick={() => router.push('/auth')}>Go to Login</Button>
      </div>
    );
  }
  
  const userDisplayNameStyle = userProfile.isShinyGold ? {} : (userProfile.nameColor ? { color: userProfile.nameColor } : { color: 'hsl(var(--foreground))'});
  const userTitleStyle = userProfile.isShinyGold ? {} : (userProfile.nameColor ? { color: userProfile.nameColor } : { color: 'hsl(var(--foreground))'});


  return (
    <div className="space-y-6">
      <input type="file" ref={avatarInputRef} onChange={handleAvatarFileChange} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={bannerInputRef} onChange={handleBannerFileChange} accept="image/*" style={{ display: 'none' }} />

      <Card className="overflow-hidden shadow-lg">
        <div className="relative bg-muted h-48 md:h-56"> 
          <Image 
            src={userProfile.banner || "https://placehold.co/1200x300.png?text=Banner"} 
            alt="Profile banner" 
            layout="fill" 
            objectFit="cover" 
            className="w-full h-full" 
            data-ai-hint="abstract banner"
            key={userProfile.banner} 
            priority
          />
          <Button 
            variant="outline" 
            size="sm" 
            className="absolute top-2 right-2 bg-background/70 hover:bg-background"
            onClick={() => bannerInputRef.current?.click()}
            disabled={isUploadingBanner}
          >
            {isUploadingBanner ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Camera size={16} className="mr-2" />}
            Change Banner
          </Button>
        </div>
        <CardContent className="p-6 pt-0">
          <div className="flex flex-col md:flex-row items-center md:items-end -mt-16 md:-mt-20 space-y-4 md:space-y-0 md:space-x-6">
            <div className="relative">
              <Avatar className="h-32 w-32 md:h-40 md:w-40 border-4 border-background shadow-md">
                <AvatarImage src={userProfile.avatar} alt={userProfile.displayName} data-ai-hint="profile picture" key={userProfile.avatar}/>
                <AvatarFallback className="text-4xl">{userProfile.displayName?.split(' ').map(n => n[0]).join('') || userProfile.displayName?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <Button 
                variant="outline" 
                size="icon" 
                className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-background/80 hover:bg-background"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                <span className="sr-only">Change profile picture</span>
              </Button>
            </div>
            <div className="flex-1 text-center md:text-left pt-4 md:pt-0"> 
              <h1 className={cn("text-3xl font-bold font-headline", userProfile.isShinyGold ? 'text-shiny-gold' : '')} style={userDisplayNameStyle}>
                {userProfile.displayName}
              </h1>
              {userProfile.username && <p className="text-sm text-muted-foreground">@{userProfile.username}</p>}
              {userProfile.title && (
                <p className={cn("text-sm font-semibold italic", userProfile.isShinyGold ? 'text-shiny-gold' : '')} style={userTitleStyle}>
                  {userProfile.title}
                </p>
              )}
              {authEmail && <p className="text-xs text-muted-foreground/70">(Auth System Email: {authEmail})</p>}
              <div className="text-sm text-muted-foreground flex items-center justify-center md:justify-start mt-1">
                <Users size={16} className="mr-1"/> Friends: {userProfile.friendsCount ?? 0}
              </div>
            </div>
          </div>
          
          <Separator className="my-6" />

          <div>
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">Bio</h3>
                <Button variant="ghost" size="sm" onClick={handleBioEditToggle}>
                    <Edit3 className="mr-2 h-4 w-4" /> {isEditingBio ? "Save Bio" : "Edit Bio"}
                </Button>
            </div>
            {isEditingBio ? (
                <Textarea 
                    value={bioEdit}
                    onChange={(e) => setBioEdit(e.target.value)}
                    placeholder="Tell us about yourself..."
                    className="min-h-[100px]"
                    maxLength={1000}
                />
            ) : (
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">{userProfile.bio || "No bio provided."}</p>
            )}
          </div>
          
          <Separator className="my-6" />

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Profile Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="displayNameInput" className="flex items-center"><UserIcon size={14} className="mr-1" />Display Name</Label>
                <Input id="displayNameInput" value={userProfile.displayName} disabled className={cn(userProfile.isShinyGold ? 'text-shiny-gold font-bold' : '')} style={userDisplayNameStyle}/>
              </div>
               <div>
                <Label htmlFor="usernameInput" className="flex items-center"><UserIcon size={14} className="mr-1" />Username</Label>
                <Input id="usernameInput" value={userProfile.username} disabled />
                 <p className="text-xs text-muted-foreground mt-1">Your unique username for friending and mentions.</p>
              </div>
               {userProfile.title && (
                <div>
                  <Label htmlFor="titleInput"><span className={cn("text-sm font-semibold italic", userProfile.isShinyGold ? 'text-shiny-gold' : '')} style={userTitleStyle}>Title:</span></Label>
                  <Input id="titleInput" value={userProfile.title} disabled className={cn("italic", userProfile.isShinyGold ? 'text-shiny-gold font-bold' : '')} style={userTitleStyle}/>
                </div>
              )}
              {userProfile.nameColor && !userProfile.isShinyGold && (
                <div>
                  <Label htmlFor="nameColorDisplay" className="flex items-center"><Palette size={14} className="mr-1" />Name Color</Label>
                  <div className="flex items-center gap-2">
                    <div style={{ backgroundColor: userProfile.nameColor }} className="w-10 h-10 rounded border" />
                    <span className="text-sm text-muted-foreground">Current name color</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
